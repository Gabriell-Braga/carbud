import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { tenants, webhookEvents } from "@/db/schema";
import { requireApiSuperAdmin } from "@/lib/auth/guards";
import {
  gatewayCredentials,
  isGatewayConfigured,
  listWebhooks,
  WEBHOOK_EVENTS,
} from "@/lib/gateway/asaas";
import { getWebhook, resumeWebhook } from "@/lib/gateway/asaas";
import { z } from "zod";
import { platformSettings } from "@/db/schema";
import { activeGatewayEnvironment, invalidateSettings } from "@/lib/plans/service";
import { lastDeliveries } from "@/lib/gateway/delivery-log";
import { isKnownEvent } from "@/lib/gateway/event-map";
import { logAuditFor } from "@/lib/audit";
import { badRequest, jsonOk, notFound, withApi } from "@/lib/http";
import { withBasePath } from "@/lib/paths";
import { getOrigin } from "@/lib/seo/urls";

export const dynamic = "force-dynamic";

/**
 * Saúde da integração, para o painel responder sozinho a "o gateway avisou?".
 *
 * Sem isto, "o Asaas nunca chamou" e "o Asaas chamou e nós recusamos" produzem
 * exatamente a mesma tela — nenhum evento registrado — e as duas causas têm
 * conserto completamente diferente.
 */
export const GET = withApi(async () => {
  await requireApiSuperAdmin("platform:billing:read");

  // a saúde mostrada é a do ambiente ativo: é nele que nascem as contratações
  const environment = await activeGatewayEnvironment();
  if (!isGatewayConfigured(environment)) {
    return jsonOk({
      configured: false,
      environment,
      diagnostico: `Nenhuma chave de ${environment === "production" ? "produção" : "sandbox"} configurada nas variáveis secretas.`,
    });
  }

  const db = await getDb();

  const [events, deliveries, webhooks] = await Promise.all([
    db
      .select({
        id: webhookEvents.id,
        eventType: webhookEvents.eventType,
        receivedAt: webhookEvents.receivedAt,
        error: webhookEvents.error,
        tenantName: tenants.name,
      })
      .from(webhookEvents)
      .leftJoin(tenants, eq(tenants.id, webhookEvents.tenantId))
      .orderBy(desc(webhookEvents.receivedAt))
      .limit(10),
    lastDeliveries(),
    listWebhooks(environment).catch((error: unknown) => ({
      data: [],
      error: error instanceof Error ? error.message : String(error),
    })),
  ]);

  const registered = "error" in webhooks ? [] : webhooks.data;
  const ours = registered.find((hook) => hook.url?.includes("/api/webhooks/asaas"));

  // O caminho bate, mas e o domínio? Depois de uma troca de domínio o webhook
  // continua cadastrado no endereço antigo e passaria por "saudável" aqui,
  // enquanto o Asaas entrega num lugar que já não responde.
  const expectedUrl = `${await getOrigin()}${withBasePath("/api/webhooks/asaas")}`;
  const staleUrl = Boolean(ours && ours.url && ours.url.replace(/\/+$/, "") !== expectedUrl);

  // eventos que precisamos e o webhook não entrega: causa silenciosa de
  // "nada chegou" com o webhook aparentemente saudável
  const subscribed = ours?.events ?? [];
  const missingEvents = ours
    ? WEBHOOK_EVENTS.filter((event) => subscribed.length > 0 && !subscribed.includes(event))
    : [];

  return jsonOk({
    configured: true,
    environment,
    webhook: ours
      ? {
          url: ours.url,
          enabled: ours.enabled,
          name: ours.name,
          interrupted: Boolean(ours.interrupted),
          events: subscribed,
        }
      : null,
    expectedUrl,
    staleUrl,
    missingEvents,
    connectionError: "error" in webhooks ? webhooks.error : null,
    lastAccepted: deliveries.accepted,
    lastRejected: deliveries.rejected,
    events: events.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      receivedAt: event.receivedAt?.toISOString() ?? null,
      error: event.error,
      tenantName: event.tenantName,
      // guardado mas sem efeito: dizer "processado" aqui mentiria
      handled: isKnownEvent(event.eventType),
    })),
    diagnostico: diagnose({
      hasWebhook: Boolean(ours),
      staleUrl,
      expectedUrl,
      enabled: ours?.enabled ?? false,
      interrupted: Boolean(ours?.interrupted),
      missingEvents,
      eventCount: events.length,
      rejectedAfterAccepted: isRejectionMoreRecent(deliveries),
      neverDelivered: !deliveries.accepted && !deliveries.rejected,
    }),
  });
});

function isRejectionMoreRecent(deliveries: Awaited<ReturnType<typeof lastDeliveries>>): boolean {
  if (!deliveries.rejected) return false;
  if (!deliveries.accepted) return true;
  return deliveries.rejected.at > deliveries.accepted.at;
}

function diagnose(state: {
  hasWebhook: boolean;
  staleUrl: boolean;
  expectedUrl: string;
  enabled: boolean;
  interrupted: boolean;
  missingEvents: readonly string[];
  eventCount: number;
  rejectedAfterAccepted: boolean;
  neverDelivered: boolean;
}): string {
  if (!state.hasWebhook) {
    return "Nenhum webhook do Asaas aponta para cá. Cadastre a URL no painel do gateway.";
  }
  if (state.staleUrl) {
    return `O webhook do Asaas aponta para outro endereço — provavelmente o domínio antigo. Troque no painel do gateway para ${state.expectedUrl}.`;
  }
  if (!state.enabled) {
    return "O webhook existe mas está desligado no Asaas. Uma resposta diferente de 200 interrompe a fila até religarem na mão.";
  }
  if (state.interrupted) {
    return "A fila do webhook está INTERROMPIDA no Asaas. Ele para de entregar depois de respostas diferentes de 200 e não reenvia sozinho — religue a fila no painel do gateway.";
  }
  if (state.missingEvents.length > 0) {
    return `O webhook não assina ${state.missingEvents.length} evento(s) que usamos: ${state.missingEvents.join(", ")}. Marque-os no cadastro do webhook, senão esses avisos nunca chegam.`;
  }
  if (state.rejectedAfterAccepted) {
    return "A última entrega foi RECUSADA por token. O que está no campo de token no painel do Asaas não confere com ASAAS_WEBHOOK_TOKEN aqui — e a fila do gateway fica parada até isso bater.";
  }
  if (state.neverDelivered) {
    return "O webhook está cadastrado e ativo, mas nenhuma entrega chegou até agora. Pode ser fila do gateway ainda em trânsito.";
  }
  if (state.eventCount === 0) {
    return "Entregas chegaram e foram aceitas, mas nenhuma virou evento, provavelmente de tipos que não mapeamos.";
  }
  return "Webhook ativo e recebendo eventos.";
}

/**
 * Religa a fila do webhook sem sair daqui.
 *
 * Relê o estado depois de mandar e devolve o que o gateway REALMENTE gravou —
 * se ele ignorar o pedido, a tela mostra que continua parada em vez de dizer
 * "pronto" e deixar o problema de pé.
 */
export const POST = withApi(async (request: Request) => {
  const context = await requireApiSuperAdmin("platform:billing:write");

  const environment = await activeGatewayEnvironment();
  if (!isGatewayConfigured(environment)) throw badRequest("Gateway não configurado");

  const { data } = await listWebhooks(environment);
  const ours = data.find((hook) => hook.url?.includes("/api/webhooks/asaas"));
  if (!ours) throw notFound("Nenhum webhook aponta para cá");

  await resumeWebhook(environment, ours.id);
  const after = await getWebhook(environment, ours.id);

  await logAuditFor(
    context,
    {
      action: "gateway.webhook.resume",
      entity: "webhook",
      entityId: ours.id,
      metadata: { environment, enabled: after.enabled, interrupted: Boolean(after.interrupted) },
    },
    request,
  );

  return jsonOk({
    enabled: after.enabled,
    interrupted: Boolean(after.interrupted),
    events: after.events ?? [],
    resolvido: after.enabled && !after.interrupted,
  });
});

const environmentSchema = z.object({ environment: z.enum(["sandbox", "production"]) });

/**
 * Troca o ambiente das contratações novas. Assinaturas existentes continuam
 * no ambiente em que nasceram, e webhooks dos dois ambientes seguem chegando.
 */
export const PATCH = withApi(async (request: Request) => {
  const context = await requireApiSuperAdmin("platform:billing:write");

  const parsed = environmentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw badRequest("Dados inválidos", parsed.error.issues);
  const { environment } = parsed.data;

  if (!gatewayCredentials()[environment]) {
    throw badRequest(
      environment === "production"
        ? "Cadastre ASAAS_API_KEY com a chave de produção antes de ligar produção."
        : "Cadastre ASAAS_SANDBOX_API_KEY antes de ligar o sandbox.",
    );
  }

  const db = await getDb();
  const previous = await activeGatewayEnvironment();
  await db
    .insert(platformSettings)
    .values({ id: "default", gatewayEnvironment: environment })
    .onConflictDoUpdate({ target: platformSettings.id, set: { gatewayEnvironment: environment } });
  await invalidateSettings();

  await logAuditFor(
    context,
    {
      action: "gateway.environment.change",
      entity: "platform_settings",
      entityId: "default",
      metadata: { from: previous, to: environment },
    },
    request,
  );

  return jsonOk({ environment });
});
