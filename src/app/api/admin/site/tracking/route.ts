import { getDb } from "@/db";
import { tenantSites, type TrackingSecrets, type TrackingSettings } from "@/db/schema";
import { logAuditFor } from "@/lib/audit";
import { requireApiTenant } from "@/lib/auth/guards";
import { badRequest, conflict, jsonOk, withApi } from "@/lib/http";
import { isVaultConfigured, seal } from "@/lib/security/vault";
import { invalidateTenantCache } from "@/lib/tenant/service";
import { getTrackingConfig, trackServerEvent } from "@/lib/tracking/dispatch";
import { newEventId } from "@/lib/tracking/event";
import { trackingSchema } from "@/lib/validation/tracking";

export const dynamic = "force-dynamic";

/**
 * Conectores de mídia da revenda.
 *
 * Os ids públicos ficam em claro (o navegador os recebe de qualquer forma);
 * o token da Meta e o api_secret do GA4 vão para o cofre e nunca voltam para
 * a tela — a resposta diz apenas se existem.
 */
export const PATCH = withApi(async (request: Request) => {
  const context = await requireApiTenant("site:write");

  const parsed = trackingSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw badRequest("Dados inválidos", parsed.error.issues);
  const input = parsed.data;

  const db = await getDb();
  const current = await getTrackingConfig(context.tenant.id);

  const settings: TrackingSettings = {
    ...current.settings,
    metaPixelId: input.metaPixelId,
    metaPageId: input.metaPageId,
    ga4MeasurementId: input.ga4MeasurementId,
    googleAdsId: input.googleAdsId,
    googleAdsLeadLabel: input.googleAdsLeadLabel,
    googleAdsSaleLabel: input.googleAdsSaleLabel,
    serverSide: input.serverSide ?? current.settings.serverSide ?? false,
  };

  /*
   * Segredo não informado é segredo mantido.
   *
   * A tela não tem como reexibi-lo, então um campo vazio significa "não
   * mexi". Para apagar de fato, ela manda o `clear...` — que é o que o botão
   * "remover" faz.
   */
  const secrets: TrackingSecrets = { ...current.secrets };
  if (input.clearMetaAccessToken) delete secrets.metaAccessToken;
  else if (input.metaAccessToken) secrets.metaAccessToken = input.metaAccessToken;

  if (input.clearGa4ApiSecret) delete secrets.ga4ApiSecret;
  else if (input.ga4ApiSecret) secrets.ga4ApiSecret = input.ga4ApiSecret;

  const hasSecrets = Object.keys(secrets).length > 0;
  if (hasSecrets && !isVaultConfigured()) {
    throw conflict("Cofre de credenciais não configurado: não guardamos token em claro.");
  }

  await db
    .insert(tenantSites)
    .values({
      tenantId: context.tenant.id,
      tracking: settings,
      trackingSecrets: hasSecrets ? await seal(JSON.stringify(secrets)) : null,
    })
    .onConflictDoUpdate({
      target: tenantSites.tenantId,
      set: {
        tracking: settings,
        trackingSecrets: hasSecrets ? await seal(JSON.stringify(secrets)) : null,
      },
    });

  // o site público lê do cache; sem isto o pixel novo só entraria no ar depois do TTL
  await invalidateTenantCache({ id: context.tenant.id, slug: context.tenant.slug });

  await logAuditFor(
    context,
    {
      action: "site.tracking.update",
      entity: "site",
      entityId: context.tenant.id,
      // nunca o valor dos segredos: só o que foi mexido
      metadata: {
        metaPixel: Boolean(settings.metaPixelId),
        ga4: Boolean(settings.ga4MeasurementId),
        googleAds: Boolean(settings.googleAdsId),
        serverSide: settings.serverSide,
        metaToken: Boolean(secrets.metaAccessToken),
        ga4Secret: Boolean(secrets.ga4ApiSecret),
      },
    },
    request,
  );

  return jsonOk({ saved: true });
});

/**
 * Evento de teste, para a revenda ver que o conector responde.
 *
 * Manda um lead de mentira com valor zero pelo servidor e devolve o que cada
 * plataforma respondeu. Sem isso, a única forma de saber se o token está
 * certo seria esperar um lead de verdade e conferir no Gerenciador de
 * Eventos — e, se estivesse errado, a conversão já teria sido perdida.
 */
export const POST = withApi(async (request: Request) => {
  const context = await requireApiTenant("site:write");
  const config = await getTrackingConfig(context.tenant.id);

  if (!config.settings.serverSide) {
    throw conflict("Ligue o envio pelo servidor antes de testar.");
  }

  const result = await trackServerEvent(
    context.tenant.id,
    {
      name: "lead",
      eventId: newEventId("teste"),
      value: 0,
      user: {
        email: "teste@carbud.com.br",
        userAgent: request.headers.get("user-agent"),
      },
    },
    config,
  );

  if (!result.meta && !result.ga4) {
    throw conflict("Nenhum conector com segredo cadastrado para testar.");
  }

  return jsonOk(result);
});
