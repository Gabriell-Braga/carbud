import { and, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { billingStatus, subscriptions, tenants, webhookEvents } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { markAcceptedDelivery, markRejectedDelivery } from "@/lib/gateway/delivery-log";
import { advanceDueDate, mapAsaasEvent, outcomeForPayment } from "@/lib/gateway/event-map";
import { AFFILIATE_RELEVANT_EVENTS } from "@/lib/affiliates/rules";
import { processAsaasPaymentEvent } from "@/lib/services/affiliates";
import { clientIp } from "@/lib/http";
import { invalidateTenantCache } from "@/lib/tenant/service";
import { registerBillingEvent } from "@/lib/services/tenants";

export const dynamic = "force-dynamic";

type AsaasPayload = {
  id?: string;
  event?: string;
  payment?: {
    id?: string;
    value?: number;
    subscription?: string;
    customer?: string;
    externalReference?: string;
    dueDate?: string;
  };
};

/**
 * Webhook do Asaas.
 *
 * Duas regras que mandam no desenho desta rota:
 *
 * 1. O webhook do Asaas NÃO é assinado — a autenticação é um token estático no
 *    header `asaas-access-token`. Comparação em tempo constante e pronto.
 *
 * 2. Se a resposta não for 200, o Asaas INTERROMPE a fila inteira até alguém
 *    religar no painel. Por isso, depois de autenticado, este handler responde
 *    200 sempre: falha de processamento é gravada no evento para reprocessar,
 *    nunca devolvida como erro.
 */
export async function POST(request: Request) {
  const expected = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!expected) {
    console.error("[asaas] ASAAS_WEBHOOK_TOKEN não configurado");
    await markRejectedDelivery("ASAAS_WEBHOOK_TOKEN não está configurado aqui");
    return new Response("unauthorized", { status: 401 });
  }

  const provided = request.headers.get("asaas-access-token") ?? "";
  if (!timingSafeEqual(provided, expected)) {
    console.warn("[asaas] token inválido de", clientIp(request));
    await markRejectedDelivery(
      provided
        ? "o token enviado não confere com ASAAS_WEBHOOK_TOKEN"
        : "a entrega veio sem o header asaas-access-token",
    );
    return new Response("unauthorized", { status: 401 });
  }

  let payload: AsaasPayload | null = null;
  try {
    payload = (await request.json()) as AsaasPayload;
  } catch {
    // corpo ilegível: aceitar e seguir, senão a fila trava
    return Response.json({ received: true, ignored: "payload ilegível" });
  }

  const eventId = payload?.id ?? payload?.payment?.id;
  const eventType = payload?.event;

  if (!eventId || !eventType) {
    return Response.json({ received: true, ignored: "evento sem id ou tipo" });
  }

  await markAcceptedDelivery(eventType);

  let processed: Record<string, unknown>;
  try {
    processed = await handleEvent(eventId, eventType, payload, request);
  } catch (error) {
    // guarda o erro e AINDA ASSIM devolve 200, para não interromper a fila
    console.error("[asaas] falha ao processar", eventType, error);
    await recordFailure(eventId, eventType, payload, error);
    processed = { deferred: true };
  }

  // apuração de afiliados tem estado próprio: roda mesmo se a cobrança falhou,
  // e falha dela fica pendente no painel sem refazer efeito de cobrança
  const paymentId = payload.payment?.id;
  if (paymentId && AFFILIATE_RELEVANT_EVENTS.has(eventType)) {
    await processAsaasPaymentEvent({ eventId, eventType, paymentId });
  }

  return Response.json({ received: true, ...processed });
}

async function handleEvent(
  eventId: string,
  eventType: string,
  payload: AsaasPayload,
  request: Request,
) {
  const db = await getDb();
  const mapped = mapAsaasEvent(eventType);
  const tenantId = await resolveTenant(payload);

  /*
   * Idempotência pela própria inserção: a linha nasce sem processedAt e só o
   * ganha depois dos efeitos. Antes, processedAt era gravado ANTES de aplicar,
   * e uma falha no meio deixava o evento com cara de concluído para sempre.
   */
  const claimed = await db
    .insert(webhookEvents)
    .values({
      id: eventId,
      provider: "asaas",
      eventType,
      tenantId,
      payload: payload as Record<string, unknown>,
    })
    .onConflictDoNothing()
    .returning({ id: webhookEvents.id });

  if (!claimed[0]) {
    // só refaz o que falhou; quem pega a linha de volta é quem limpa o erro
    const retaken = await db
      .update(webhookEvents)
      .set({ error: null, tenantId })
      .where(
        and(
          eq(webhookEvents.id, eventId),
          isNotNull(webhookEvents.error),
          sql`${webhookEvents.processedAt} IS NULL`,
        ),
      )
      .returning({ id: webhookEvents.id });
    if (!retaken[0]) return { duplicate: true };
  }

  const result = await applyEvent(eventId, eventType, mapped, tenantId, payload, request);
  await db
    .update(webhookEvents)
    .set({ processedAt: new Date(), error: null })
    .where(eq(webhookEvents.id, eventId));
  return result;
}

async function applyEvent(
  eventId: string,
  eventType: string,
  mapped: ReturnType<typeof mapAsaasEvent>,
  tenantId: string | null,
  payload: AsaasPayload,
  request: Request,
): Promise<Record<string, unknown>> {
  if (!mapped) return { ignored: "evento não mapeado" };
  if (!tenantId) return { ignored: "revenda não identificada" };
  if (mapped.informational) {
    await noteOnly(tenantId, mapped.note);
    return { noted: true };
  }

  const outcome = outcomeForPayment(
    mapped,
    await paymentAlreadyRegistered(eventId, payload.payment?.id),
  );
  await applyOutcome(tenantId, eventType, outcome, request);
  return { applied: eventType };
}

/** Outro evento positivo da mesma cobrança já foi aplicado? */
async function paymentAlreadyRegistered(
  eventId: string,
  paymentId: string | undefined,
): Promise<boolean> {
  if (!paymentId) return false;
  const db = await getDb();
  const rows = await db
    .select({ id: webhookEvents.id })
    .from(webhookEvents)
    .where(
      and(
        eq(webhookEvents.provider, "asaas"),
        ne(webhookEvents.id, eventId),
        isNotNull(webhookEvents.processedAt),
        inArray(webhookEvents.eventType, ["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"]),
        sql`json_extract(${webhookEvents.payload}, '$.payment.id') = ${paymentId}`,
      ),
    )
    .limit(1);
  return Boolean(rows[0]);
}

/**
 * Acha a revenda pelo caminho mais confiável disponível.
 * `externalReference` é o id do tenant e é o que mandamos na criação — os
 * outros são rede de segurança para cobranças criadas fora do nosso fluxo.
 */
async function resolveTenant(payload: AsaasPayload): Promise<string | null> {
  const db = await getDb();
  const reference = payload.payment?.externalReference;

  if (reference) {
    const found = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.id, reference))
      .limit(1);
    if (found[0]) return found[0].id;
  }

  const subscriptionId = payload.payment?.subscription;
  if (subscriptionId) {
    const found = await db
      .select({ tenantId: subscriptions.tenantId })
      .from(subscriptions)
      .where(eq(subscriptions.gatewaySubscriptionId, subscriptionId))
      .limit(1);
    if (found[0]) return found[0].tenantId;
  }

  const customerId = payload.payment?.customer;
  if (customerId) {
    const found = await db
      .select({ tenantId: subscriptions.tenantId })
      .from(subscriptions)
      .where(eq(subscriptions.gatewayCustomerId, customerId))
      .limit(1);
    if (found[0]) return found[0].tenantId;
  }

  return null;
}

async function applyOutcome(
  tenantId: string,
  eventType: string,
  outcome: NonNullable<ReturnType<typeof mapAsaasEvent>>,
  request: Request,
) {
  const db = await getDb();

  const current = await db
    .select()
    .from(billingStatus)
    .where(eq(billingStatus.tenantId, tenantId))
    .limit(1);
  const previous = current[0];

  const subscriptionRows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.tenantId, tenantId))
    .limit(1);
  const subscription = subscriptionRows[0];

  const now = new Date();
  const updates: Record<string, unknown> = {};

  if (outcome.billingStatus) updates.status = outcome.billingStatus;

  if (outcome.registersPayment) {
    updates.lastPaymentAt = now;
    const base = previous?.currentDueDate ?? now;
    const from = base.getTime() < now.getTime() ? now : base;
    updates.currentDueDate = advanceDueDate(from, "MONTHLY");
  }

  if (Object.keys(updates).length > 0) {
    if (previous) {
      await db.update(billingStatus).set(updates).where(eq(billingStatus.tenantId, tenantId));
    } else {
      await db.insert(billingStatus).values({ tenantId, ...updates });
    }
  }

  if (subscription && outcome.subscriptionStatus) {
    await db
      .update(subscriptions)
      .set({
        status: outcome.subscriptionStatus,
        lastEventType: eventType,
        lastEventAt: now,
      })
      .where(eq(subscriptions.tenantId, tenantId));
  }

  await registerBillingEvent({
    tenantId,
    type: outcome.registersPayment ? "payment" : "status_change",
    statusFrom: previous?.status ?? null,
    statusTo: outcome.billingStatus ?? previous?.status ?? null,
    note: outcome.note,
    actor: { userId: null, email: "asaas" },
  });

  const tenantRow = await db
    .select({ id: tenants.id, slug: tenants.slug })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  if (tenantRow[0]) await invalidateTenantCache(tenantRow[0]);

  await logAudit(
    { userId: null, email: "asaas", role: null, tenantId, impersonated: false },
    {
      action: "billing.gateway_event",
      entity: "billing_status",
      entityId: tenantId,
      tenantId,
      metadata: { eventType, statusTo: outcome.billingStatus },
    },
    request,
  );
}

async function noteOnly(tenantId: string, note: string) {
  await registerBillingEvent({
    tenantId,
    type: "note",
    note,
    actor: { userId: null, email: "asaas" },
  });
}

async function recordFailure(
  eventId: string,
  eventType: string,
  payload: unknown,
  error: unknown,
) {
  try {
    const db = await getDb();
    await db
      .insert(webhookEvents)
      .values({
        id: eventId,
        provider: "asaas",
        eventType,
        payload: payload as Record<string, unknown>,
        error: error instanceof Error ? error.message : String(error),
      })
      // a linha já existe (foi reivindicada antes da falha): o erro precisa ir para ela
      .onConflictDoUpdate({
        target: webhookEvents.id,
        set: { error: error instanceof Error ? error.message : String(error) },
      });
  } catch (writeError) {
    console.error("[asaas] não consegui nem registrar a falha:", writeError);
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
