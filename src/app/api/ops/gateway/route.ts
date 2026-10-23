import { desc, eq, or } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { billingStatus, plans, subscriptions, tenants, webhookEvents } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { gatewayCredentials, listWebhooks, WEBHOOK_EVENTS } from "@/lib/gateway/asaas";
import { contractSubscription } from "@/lib/gateway/subscribe";
import { badRequest, jsonOk, withApi } from "@/lib/http";
import { assertOpsSecret } from "@/lib/ops";
import { activeGatewayEnvironment, getPlatformSettings } from "@/lib/plans/service";
import {
  effectiveBillingStatus,
  getTenantCoreById,
  graceDaysLeft,
  isPublicSiteAvailable,
  resolvePanelAccess,
} from "@/lib/tenant/service";

export const dynamic = "force-dynamic";

/**
 * Diagnóstico da integração — somente leitura.
 *
 * Reporta apenas se cada segredo ESTÁ presente, nunca o valor. Com
 * `?tenantId=`, devolve também a situação daquela revenda, para conferir se um
 * evento do gateway chegou e produziu o efeito esperado.
 */
export const GET = withApi(async (request: Request) => {
  assertOpsSecret(request);

  const credentials = gatewayCredentials();
  const environment = await activeGatewayEnvironment();
  const apiKeyPresent = Boolean(credentials[environment]);
  const present = (name: string) => (process.env[name] ? "configurado" : "AUSENTE");

  const report: Record<string, unknown> = {
    segredos: {
      ASAAS_API_KEY: present("ASAAS_API_KEY"),
      ASAAS_WEBHOOK_TOKEN: present("ASAAS_WEBHOOK_TOKEN"),
      ASAAS_SANDBOX_API_KEY: present("ASAAS_SANDBOX_API_KEY"),
      ASAAS_SANDBOX_WEBHOOK_TOKEN: present("ASAAS_SANDBOX_WEBHOOK_TOKEN"),
      // só a presença e o tamanho: o valor nunca sai daqui
      VAULT_KEY: describeVaultKey(),
    },
  };

  const query = new URL(request.url).searchParams;
  const tenantRef = query.get("tenantId") ?? query.get("slug");
  if (tenantRef) report.revenda = await tenantReport(tenantRef);

  if (!apiKeyPresent) {
    report.proximoPasso = `Sem chave para o ambiente ativo (${environment}). Cadastrar nas Secret Variables e refazer o deploy.`;
    return jsonOk(report);
  }

  report.ambiente = environment;
  report.configuracoes = await getPlatformSettings();

  try {
    const { data } = await listWebhooks(environment);
    report.conexao = "ok";
    report.webhooks = data.map((hook) => ({
      id: hook.id,
      nome: hook.name,
      url: hook.url,
      ativo: hook.enabled,
    }));

    const nosso = data.find((hook) => hook.url?.includes("/api/webhooks/asaas"));
    report.diagnostico = !nosso
      ? "Nenhum webhook aponta para /api/webhooks/asaas."
      : nosso.enabled
        ? "Webhook apontando para cá e ATIVO."
        : "Webhook apontando para cá, mas DESLIGADO.";
    report.eventosEsperados = WEBHOOK_EVENTS;
  } catch (error) {
    report.conexao = "falhou";
    report.erro = error instanceof Error ? error.message : String(error);
    report.diagnostico =
      "A chave não autenticou ou a conta bloqueia o IP de saída. Rodamos em Cloudflare Workers, com IP dinâmico.";
  }

  return jsonOk(report);
});

/** Aceita id ou slug — o slug é o que se enxerga no painel. */
async function tenantReport(ref: string) {
  const db = await getDb();

  const rows = await db
    .select({ tenant: tenants, billing: billingStatus, plan: plans })
    .from(tenants)
    .leftJoin(billingStatus, eq(billingStatus.tenantId, tenants.id))
    .leftJoin(plans, eq(plans.id, tenants.planId))
    .where(or(eq(tenants.id, ref), eq(tenants.slug, ref)))
    .limit(1);

  const row = rows[0];
  if (!row) return { erro: "revenda não encontrada" };
  const tenantId = row.tenant.id;

  const subscriptionRows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.tenantId, tenantId))
    .limit(1);

  const events = await db
    .select({
      id: webhookEvents.id,
      tipo: webhookEvents.eventType,
      recebidoEm: webhookEvents.receivedAt,
      erro: webhookEvents.error,
    })
    .from(webhookEvents)
    .where(eq(webhookEvents.tenantId, tenantId))
    .orderBy(desc(webhookEvents.receivedAt))
    .limit(10);

  const core = await getTenantCoreById(tenantId);

  return {
    id: tenantId,
    nome: row.tenant.name,
    slug: row.tenant.slug,
    plano: row.plan?.name ?? null,
    situacaoGravada: row.billing?.status ?? null,
    situacaoReal: core ? effectiveBillingStatus(core) : null,
    toleranciaRestante: core ? graceDaysLeft(core) : null,
    siteNoAr: core ? isPublicSiteAvailable(core) : null,
    acessoAoPainel: core ? resolvePanelAccess(core) : null,
    proximoVencimento: row.billing?.currentDueDate ?? null,
    assinatura: subscriptionRows[0]
      ? {
          status: subscriptionRows[0].status,
          gatewayCustomerId: subscriptionRows[0].gatewayCustomerId,
          gatewaySubscriptionId: subscriptionRows[0].gatewaySubscriptionId,
          ultimoEvento: subscriptionRows[0].lastEventType,
        }
      : null,
    ultimosEventos: events,
  };
}

/* ------------------------------------------------------------------------ */

const contractSchema = z.object({
  /** id ou slug da revenda. */
  tenantId: z.string().min(1),
  planSlug: z.string().min(1),
  billingType: z.enum(["BOLETO", "CREDIT_CARD", "PIX", "UNDEFINED"]).optional(),
  couponCode: z.string().trim().max(40).optional(),
  dueDay: z.coerce.number().int().min(1).max(28).optional(),
});

/**
 * Contrata um plano para uma revenda pela via operacional.
 *
 * Mesma operação da tela do Painel Geral, exposta aqui para suporte e para
 * validar a integração antes de a tela existir. Fica registrada na auditoria
 * como ação do sistema.
 */
export const POST = withApi(async (request: Request) => {
  assertOpsSecret(request);

  const parsed = contractSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw badRequest("Dados inválidos", parsed.error.issues);

  const db = await getDb();
  const planRows = await db
    .select({ id: plans.id })
    .from(plans)
    .where(eq(plans.slug, parsed.data.planSlug))
    .limit(1);
  if (!planRows[0]) throw badRequest(`Plano "${parsed.data.planSlug}" não encontrado`);

  const tenantRows = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(or(eq(tenants.id, parsed.data.tenantId), eq(tenants.slug, parsed.data.tenantId)))
    .limit(1);
  if (!tenantRows[0]) throw badRequest("Revenda não encontrada");
  const tenantId = tenantRows[0].id;

  const result = await contractSubscription({
    tenantId,
    planId: planRows[0].id,
    billingType: parsed.data.billingType,
    couponCode: parsed.data.couponCode || null,
    dueDay: parsed.data.dueDay,
  });

  await logAudit(
    { userId: null, email: "ops", role: null, tenantId, impersonated: false },
    {
      action: "billing.subscription.create",
      entity: "subscription",
      entityId: tenantId,
      tenantId,
      metadata: { planSlug: parsed.data.planSlug, mode: result.mode, via: "ops" },
    },
    request,
  );

  return jsonOk(result);
});

/**
 * Diz se o cofre está utilizável sem revelar a chave.
 *
 * Confere o tamanho porque chave truncada ao colar passa como "configurada" e
 * só falha quando alguém tenta conectar um portal — o pior momento possível
 * para descobrir.
 */
function describeVaultKey(): string {
  const value = process.env.VAULT_KEY;
  if (!value) return "AUSENTE";
  try {
    const bytes = atob(value).length;
    return bytes === 32 ? "configurado" : `INVÁLIDO: ${bytes} bytes, precisa de 32`;
  } catch {
    return "INVÁLIDO: não é base64";
  }
}
