import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  affiliateCommissionAdjustments,
  affiliateCommissions,
  affiliateEventProcessing,
  affiliatePaymentFacts,
  affiliatePayouts,
  affiliates,
  newId,
  subscriptions,
  tenantAffiliations,
  tenants,
  type Affiliate,
  type AffiliatePaymentFact,
  type AffiliationSource,
} from "@/db/schema";
import {
  asaasCommissionBase,
  classifyPaymentStatus,
  commissionCents,
  entitledCents,
  generateAffiliateCode,
  nextAdjustment,
  normalizeAffiliateCode,
  refundedCentsOf,
  type PaymentClass,
} from "@/lib/affiliates/rules";
import { getPayment, type AsaasEnvironment, type AsaasPayment } from "@/lib/gateway/asaas";
import { parsePaymentReference } from "@/lib/gateway/references";
import { billingDate } from "@/lib/gateway/brazil-date";
import { badRequest, conflict, notFound } from "@/lib/http";

export type AffiliateActor = { userId: string | null; email: string | null };

/* ------------------------------------------------------------------------ */
/* Cadastro                                                                  */
/* ------------------------------------------------------------------------ */

export async function createAffiliate(
  input: {
    name: string;
    email?: string | null;
    phone?: string | null;
    notes?: string | null;
    defaultCommissionBps: number;
  },
  actor: AffiliateActor,
): Promise<Affiliate> {
  const db = await getDb();
  // o índice único é quem garante: consultar antes não protege de corrida
  for (let attempt = 0; attempt < 5; attempt++) {
    const inserted = await db
      .insert(affiliates)
      .values({ ...input, code: generateAffiliateCode(), createdByUserId: actor.userId })
      .onConflictDoNothing({ target: affiliates.code })
      .returning();
    if (inserted[0]) return inserted[0];
  }
  throw new Error("Não foi possível gerar um código único de afiliado");
}

export async function getAffiliate(id: string): Promise<Affiliate> {
  const db = await getDb();
  const rows = await db.select().from(affiliates).where(eq(affiliates.id, id)).limit(1);
  if (!rows[0]) throw notFound("Afiliado não encontrado");
  return rows[0];
}

/* ------------------------------------------------------------------------ */
/* Origem da revenda                                                         */
/* ------------------------------------------------------------------------ */

const codeError = (message: string, field: string) =>
  badRequest(message, [{ path: [field], message }]);

/** Afiliado que pode receber indicação nova. Código inválido nunca é ignorado. */
export async function resolveAffiliateForAttribution(
  rawCode: string,
  field = "affiliateCode",
): Promise<Affiliate> {
  const code = normalizeAffiliateCode(rawCode);
  if (!code) throw codeError("Informe o código do afiliado", field);
  const db = await getDb();
  const rows = await db.select().from(affiliates).where(eq(affiliates.code, code)).limit(1);
  const affiliate = rows[0];
  if (!affiliate) throw codeError("Código de afiliado não encontrado", field);
  if (affiliate.status !== "active") {
    throw codeError("Este afiliado está inativo e não aceita novas indicações", field);
  }
  return affiliate;
}

export function affiliationValues(
  tenantId: string,
  affiliate: Affiliate,
  source: AffiliationSource,
  actor: AffiliateActor,
) {
  return {
    id: newId(),
    tenantId,
    affiliateId: affiliate.id,
    codeSnapshot: affiliate.code,
    commissionBpsSnapshot: affiliate.defaultCommissionBps,
    attributedAt: new Date(),
    source,
    createdByUserId: actor.userId,
    createdByEmail: actor.email,
  };
}

export async function getTenantAffiliation(tenantId: string) {
  const db = await getDb();
  const rows = await db
    .select({ affiliation: tenantAffiliations, affiliate: affiliates })
    .from(tenantAffiliations)
    .innerJoin(affiliates, eq(affiliates.id, tenantAffiliations.affiliateId))
    .where(eq(tenantAffiliations.tenantId, tenantId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Registra a origem. Mesmo código de novo é no-op; outro código é conflito —
 * trocar a origem é correção administrativa, com motivo, não efeito colateral
 * de uma recontratação.
 */
export async function attachAffiliation(input: {
  tenantId: string;
  affiliate: Affiliate;
  source: AffiliationSource;
  actor: AffiliateActor;
}): Promise<{ created: boolean }> {
  const db = await getDb();
  const inserted = await db
    .insert(tenantAffiliations)
    .values(affiliationValues(input.tenantId, input.affiliate, input.source, input.actor))
    .onConflictDoNothing({ target: tenantAffiliations.tenantId })
    .returning({ id: tenantAffiliations.id });
  if (inserted[0]) return { created: true };

  const current = await getTenantAffiliation(input.tenantId);
  if (current?.affiliation.affiliateId === input.affiliate.id) return { created: false };
  throw conflict(
    "Esta revenda já tem outro afiliado de origem. Corrija pela ficha da revenda, aba Financeiro.",
  );
}

/**
 * Correção da origem pelo super-admin. Só antes de existir comissão: depois
 * disso, trocar o vínculo reescreveria a quem um dinheiro já apurado pertence.
 */
export async function correctAffiliation(input: {
  tenantId: string;
  affiliateCode: string | null;
  actor: AffiliateActor;
}) {
  const db = await getDb();
  const current = await getTenantAffiliation(input.tenantId);

  if (current) {
    const commissions = await db
      .select({ id: affiliateCommissions.id })
      .from(affiliateCommissions)
      .where(eq(affiliateCommissions.affiliationId, current.affiliation.id))
      .limit(1);
    if (commissions[0]) {
      throw conflict("A origem já gerou comissão e não pode mais ser trocada diretamente.");
    }
  }

  const next = input.affiliateCode
    ? await resolveAffiliateForAttribution(input.affiliateCode)
    : null;

  if (current && next?.id === current.affiliate.id) return { previous: current, next };

  // troca num batch só: a revenda nunca fica um instante sem a origem antiga e sem a nova
  const statements = [
    ...(current
      ? [db.delete(tenantAffiliations).where(eq(tenantAffiliations.id, current.affiliation.id))]
      : []),
    ...(next
      ? [
          db
            .insert(tenantAffiliations)
            .values(affiliationValues(input.tenantId, next, "admin", input.actor)),
        ]
      : []),
  ];
  if (statements.length > 0) {
    await db.batch(statements as unknown as Parameters<typeof db.batch>[0]);
  }
  return { previous: current, next };
}

/* ------------------------------------------------------------------------ */
/* Apuração                                                                  */
/* ------------------------------------------------------------------------ */

type EvaluationResult = { review?: string };

/** Data "AAAA-MM-DD" do Asaas como instante, no meio do dia de Brasília. */
function asaasDate(value: string | null | undefined): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? "");
  if (!match) return null;
  return billingDate({ year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) });
}

/**
 * A revenda dona do pagamento. Referência, assinatura e cliente precisam
 * concordar; cobrança fora da assinatura pode ser avulsa e não é receita
 * recorrente garantida, então vai para revisão.
 */
async function resolvePaymentTenant(
  payment: AsaasPayment,
): Promise<{ tenantId: string | null; review?: string }> {
  const db = await getDb();

  const reference = parsePaymentReference(payment.externalReference);
  let byReference: string | null = null;
  if (reference.tenantId) {
    const rows = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.id, reference.tenantId))
      .limit(1);
    byReference = rows[0]?.id ?? null;
  }

  // o primeiro mês promocional da contratação no cartão é avulso por desenho,
  // mas é receita da assinatura: entra na comissão como qualquer mensalidade
  if (!payment.subscription && reference.promo && byReference) {
    return { tenantId: byReference };
  }
  if (!payment.subscription) {
    return { tenantId: byReference, review: "Cobrança fora de assinatura" };
  }

  const bySubscription = await db
    .select({ tenantId: subscriptions.tenantId })
    .from(subscriptions)
    .where(eq(subscriptions.gatewaySubscriptionId, payment.subscription))
    .limit(1);
  const subscriptionTenant = bySubscription[0]?.tenantId ?? null;

  if (byReference && subscriptionTenant && byReference !== subscriptionTenant) {
    return { tenantId: null, review: "Referência e assinatura apontam revendas diferentes" };
  }

  const tenantId = byReference ?? subscriptionTenant;
  if (!tenantId) return { tenantId: null, review: "Revenda não identificada" };

  if (payment.customer) {
    const own = await db
      .select({ customerId: subscriptions.gatewayCustomerId })
      .from(subscriptions)
      .where(eq(subscriptions.tenantId, tenantId))
      .limit(1);
    const customerId = own[0]?.customerId;
    if (customerId && customerId !== payment.customer) {
      return { tenantId, review: "Cliente do gateway diferente do da revenda" };
    }
  }

  return { tenantId };
}

/**
 * Consulta o pagamento no Asaas e grava o estado atual.
 *
 * O estado consultado é a verdade, não o evento: a ordem de chegada não
 * importa, e um RECEIVED atrasado depois de um estorno não ressuscita nada,
 * porque a consulta já devolve REFUNDED.
 */
async function syncAsaasFact(
  environment: AsaasEnvironment,
  paymentId: string,
): Promise<AffiliatePaymentFact> {
  const payment = await getPayment(environment, paymentId);
  const paymentClass = classifyPaymentStatus(payment.status);
  const tenant = await resolvePaymentTenant(payment);
  const base = paymentClass === "unpaid" ? null : asaasCommissionBase(payment);
  const baseCents = base && "baseCents" in base ? base.baseCents : null;

  const review =
    paymentClass === "unpaid"
      ? null
      : paymentClass === "unknown"
        ? `Situação desconhecida no gateway: ${payment.status}`
        : (tenant.review ?? (base && "review" in base ? base.review : null));

  const now = new Date();
  const effectiveAt =
    paymentClass === "unpaid" || paymentClass === "unknown"
      ? null
      : (asaasDate(payment.clientPaymentDate) ?? asaasDate(payment.paymentDate) ?? now);

  const values = {
    tenantId: tenant.tenantId,
    gatewayCustomerId: payment.customer ?? null,
    gatewaySubscriptionId: payment.subscription ?? null,
    gatewayStatus: payment.status,
    grossCents: Math.round((payment.value ?? 0) * 100),
    baseCents,
    refundedCents: baseCents === null ? 0 : refundedCentsOf(payment, baseCents),
    reviewReason: review,
    lastCheckedAt: now,
  };

  const db = await getDb();
  const rows = await db
    .insert(affiliatePaymentFacts)
    .values({
      source: "asaas",
      environment,
      sourcePaymentId: payment.id,
      effectiveAt,
      ...values,
    })
    .onConflictDoUpdate({
      target: [
        affiliatePaymentFacts.source,
        affiliatePaymentFacts.environment,
        affiliatePaymentFacts.sourcePaymentId,
      ],
      // a competência é a primeira confirmação: um segundo evento não a desloca
      set: {
        ...values,
        effectiveAt: sql`coalesce(${affiliatePaymentFacts.effectiveAt}, excluded.effective_at)`,
        updatedAt: now,
      },
    })
    .returning();
  return rows[0];
}

function factClass(fact: AffiliatePaymentFact): PaymentClass {
  return classifyPaymentStatus(fact.gatewayStatus);
}

const ADJUSTMENT_REASONS: Record<PaymentClass, string> = {
  paid: "Recomposição do direito",
  held: "Recomposição do direito",
  refunded: "Estorno",
  unpaid: "Pagamento desfeito no gateway",
  unknown: "Ajuste por situação desconhecida",
};

/** Cria a comissão do pagamento (uma só) e ajusta ao direito atual. */
async function evaluateFact(fact: AffiliatePaymentFact): Promise<EvaluationResult> {
  if (!fact.effectiveAt) return {};
  const db = await getDb();
  const paymentClass = factClass(fact);

  let commission = (
    await db
      .select()
      .from(affiliateCommissions)
      .where(eq(affiliateCommissions.paymentFactId, fact.id))
      .limit(1)
  )[0];

  if (!commission) {
    const base = fact.baseOverrideCents ?? fact.baseCents;
    if (fact.baseOverrideCents === null && fact.reviewReason) return { review: fact.reviewReason };
    if (base === null || !fact.tenantId) return { review: "Pagamento sem base ou revenda" };
    // estorno visto antes de qualquer confirmação: não nasce crédito
    if (paymentClass !== "paid" && paymentClass !== "held") return {};

    const affiliation = (
      await db
        .select()
        .from(tenantAffiliations)
        .where(eq(tenantAffiliations.tenantId, fact.tenantId))
        .limit(1)
    )[0];
    // sem retroativo: só pagamento a partir da atribuição
    if (!affiliation || affiliation.attributedAt.getTime() > fact.effectiveAt.getTime()) return {};

    await db
      .insert(affiliateCommissions)
      .values({
        paymentFactId: fact.id,
        affiliationId: affiliation.id,
        affiliateId: affiliation.affiliateId,
        tenantId: fact.tenantId,
        baseCents: base,
        commissionBps: affiliation.commissionBpsSnapshot,
        amountCents: commissionCents(base, affiliation.commissionBpsSnapshot),
        competenceAt: fact.effectiveAt,
        status: paymentClass === "held" ? "held" : "available",
      })
      .onConflictDoNothing({ target: affiliateCommissions.paymentFactId });

    commission = (
      await db
        .select()
        .from(affiliateCommissions)
        .where(eq(affiliateCommissions.paymentFactId, fact.id))
        .limit(1)
    )[0];
  }

  const adjustments = await db
    .select({ amountCents: affiliateCommissionAdjustments.amountCents })
    .from(affiliateCommissionAdjustments)
    .where(eq(affiliateCommissionAdjustments.commissionId, commission.id))
    .orderBy(asc(affiliateCommissionAdjustments.createdAt));

  const next = nextAdjustment({
    commissionId: commission.id,
    originalCents: commission.amountCents,
    adjustments: adjustments.map((item) => item.amountCents),
    entitledCents: entitledCents({
      paymentClass,
      baseCents: commission.baseCents,
      refundedCents: fact.refundedCents,
      bps: commission.commissionBps,
    }),
  });

  if (next) {
    const partial = paymentClass === "paid" && fact.refundedCents > 0;
    await db
      .insert(affiliateCommissionAdjustments)
      .values({
        commissionId: commission.id,
        affiliateId: commission.affiliateId,
        idempotencyKey: next.key,
        amountCents: next.amountCents,
        reason: partial ? "Estorno parcial" : ADJUSTMENT_REASONS[paymentClass],
        sourceRef: `${fact.source}:${fact.sourcePaymentId}:${fact.gatewayStatus}`,
        actorEmail: fact.source,
      })
      .onConflictDoNothing({ target: affiliateCommissionAdjustments.idempotencyKey });
  }

  const status = paymentClass === "held" ? "held" : "available";
  if (commission.status !== status) {
    await db
      .update(affiliateCommissions)
      .set({ status })
      .where(eq(affiliateCommissions.id, commission.id));
  }

  return {};
}

/**
 * Roda uma apuração registrada. Só marca concluída depois dos efeitos
 * gravados; falha fica com o erro e volta pelo botão de reprocessar.
 */
async function runProcessing(id: string) {
  const db = await getDb();
  const row = (
    await db.select().from(affiliateEventProcessing).where(eq(affiliateEventProcessing.id, id)).limit(1)
  )[0];
  if (!row) throw notFound("Apuração não encontrada");
  if (row.state === "done") return row;

  await db
    .update(affiliateEventProcessing)
    .set({ attempts: sql`${affiliateEventProcessing.attempts} + 1` })
    .where(eq(affiliateEventProcessing.id, id));

  let state: "done" | "review" | "failed";
  let lastError: string | null = null;
  let paymentFactId = row.paymentFactId;

  try {
    let fact: AffiliatePaymentFact | undefined;
    if (row.source === "asaas") {
      if (!row.sourcePaymentId) throw new Error("Evento sem id de pagamento");
      // eventos anteriores à chave de ambiente eram todos de produção
      fact = await syncAsaasFact(row.environment ?? "production", row.sourcePaymentId);
    } else if (paymentFactId) {
      fact = (
        await db
          .select()
          .from(affiliatePaymentFacts)
          .where(eq(affiliatePaymentFacts.id, paymentFactId))
          .limit(1)
      )[0];
    }
    if (!fact) throw new Error("Pagamento não encontrado");
    paymentFactId = fact.id;

    const result = await evaluateFact(fact);
    state = result.review ? "review" : "done";
    lastError = result.review ?? null;
  } catch (error) {
    state = "failed";
    lastError = error instanceof Error ? error.message : String(error);
  }

  const updated = await db
    .update(affiliateEventProcessing)
    .set({ state, lastError, paymentFactId })
    .where(eq(affiliateEventProcessing.id, id))
    .returning();
  return updated[0];
}

/** Ponto de entrada do webhook. Nunca lança: falha vira pendência visível. */
export async function processAsaasPaymentEvent(input: {
  eventId: string;
  eventType: string;
  paymentId: string;
  environment: AsaasEnvironment;
}) {
  try {
    const db = await getDb();
    await db
      .insert(affiliateEventProcessing)
      .values({
        id: input.eventId,
        source: "asaas",
        sourcePaymentId: input.paymentId,
        environment: input.environment,
        eventType: input.eventType,
      })
      .onConflictDoNothing();
    await runProcessing(input.eventId);
  } catch (error) {
    console.error("[afiliados] falha ao registrar apuração", input.eventType, error);
  }
}

export async function retryProcessing(id: string) {
  return runProcessing(id);
}

/** Recebimento manual (plano negociado) já gravado? Serve de trava de idempotência. */
export async function manualPaymentExists(key: string): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .select({ id: affiliatePaymentFacts.id })
    .from(affiliatePaymentFacts)
    .where(
      and(
        eq(affiliatePaymentFacts.source, "manual"),
        eq(affiliatePaymentFacts.sourcePaymentId, key),
      ),
    )
    .limit(1);
  return Boolean(rows[0]);
}

export async function recordManualPayment(input: {
  key: string;
  tenantId: string;
  amountCents: number;
  paidAt: Date;
}) {
  const db = await getDb();
  const inserted = await db
    .insert(affiliatePaymentFacts)
    .values({
      source: "manual",
      environment: "manual",
      sourcePaymentId: input.key,
      tenantId: input.tenantId,
      gatewayStatus: "RECEIVED",
      grossCents: input.amountCents,
      baseCents: input.amountCents,
      effectiveAt: input.paidAt,
      lastCheckedAt: new Date(),
    })
    .onConflictDoNothing()
    .returning({ id: affiliatePaymentFacts.id });
  if (!inserted[0]) return;

  const processingId = `manual:${input.key}`;
  await db
    .insert(affiliateEventProcessing)
    .values({ id: processingId, source: "manual", paymentFactId: inserted[0].id })
    .onConflictDoNothing();
  await runProcessing(processingId);
}

/** Resolve uma revisão informando a base à mão. Não mexe em comissão já criada. */
export async function resolveFactReview(factId: string, baseCents: number) {
  const db = await getDb();
  const updated = await db
    .update(affiliatePaymentFacts)
    .set({ baseOverrideCents: baseCents })
    .where(eq(affiliatePaymentFacts.id, factId))
    .returning();
  const fact = updated[0];
  if (!fact) throw notFound("Pagamento não encontrado");
  if (!fact.tenantId) throw badRequest("Pagamento sem revenda identificada: corrija no gateway");

  const result = await evaluateFact(fact);
  await db
    .update(affiliateEventProcessing)
    .set({ state: result.review ? "review" : "done", lastError: result.review ?? null })
    .where(
      and(
        eq(affiliateEventProcessing.paymentFactId, factId),
        inArray(affiliateEventProcessing.state, ["review", "failed"]),
      ),
    );
  return fact;
}

export async function listPendingProcessing(limit = 50) {
  const db = await getDb();
  return db
    .select({ processing: affiliateEventProcessing, fact: affiliatePaymentFacts })
    .from(affiliateEventProcessing)
    .leftJoin(
      affiliatePaymentFacts,
      eq(affiliatePaymentFacts.id, affiliateEventProcessing.paymentFactId),
    )
    .where(inArray(affiliateEventProcessing.state, ["pending", "failed", "review"]))
    .orderBy(desc(affiliateEventProcessing.updatedAt))
    .limit(limit);
}

/* ------------------------------------------------------------------------ */
/* Repasses                                                                  */
/* ------------------------------------------------------------------------ */

function availableSql(affiliateId: string) {
  return sql`(
    (SELECT coalesce(sum(c.amount_cents), 0) FROM affiliate_commissions c
      WHERE c.affiliate_id = ${affiliateId} AND c.status = 'available')
    + (SELECT coalesce(sum(a.amount_cents), 0) FROM affiliate_commission_adjustments a
      JOIN affiliate_commissions c ON c.id = a.commission_id
      WHERE c.affiliate_id = ${affiliateId} AND c.status = 'available')
    - (SELECT coalesce(sum(p.amount_cents), 0) FROM affiliate_payouts p
      WHERE p.affiliate_id = ${affiliateId} AND p.status = 'recorded')
  )`;
}

/**
 * Registra repasse feito por fora.
 *
 * Saldo e gravação no mesmo INSERT ... SELECT ... WHERE: o D1 executa um
 * comando por vez, então dois cliques simultâneos não passam os dois pela
 * conferência de saldo.
 */
// ponytail: saldo em razão único, sem alocar repasse por comissão; itens por comissão se o financeiro pedir conciliação linha a linha
export async function recordPayout(input: {
  affiliateId: string;
  amountCents: number;
  paidAt: Date;
  reference: string;
  note: string | null;
  idempotencyKey: string;
  actor: AffiliateActor;
}) {
  const db = await getDb();
  const id = newId();
  await db.run(sql`
    INSERT INTO affiliate_payouts
      (id, affiliate_id, amount_cents, paid_at, reference, note, status, idempotency_key,
       created_by_user_id, created_by_email, created_at)
    SELECT ${id}, ${input.affiliateId}, ${input.amountCents}, ${input.paidAt.getTime()},
      ${input.reference}, ${input.note}, 'recorded', ${input.idempotencyKey},
      ${input.actor.userId}, ${input.actor.email}, ${Date.now()}
    WHERE ${availableSql(input.affiliateId)} >= ${input.amountCents}
    ON CONFLICT(idempotency_key) DO NOTHING
  `);

  const rows = await db
    .select()
    .from(affiliatePayouts)
    .where(eq(affiliatePayouts.idempotencyKey, input.idempotencyKey))
    .limit(1);
  const payout = rows[0];
  if (!payout) throw badRequest("Valor acima do saldo disponível para repasse");
  if (payout.affiliateId !== input.affiliateId || payout.amountCents !== input.amountCents) {
    throw conflict("Chave de operação já usada em outro repasse");
  }
  return { payout, created: payout.id === id };
}

export async function voidPayout(input: {
  affiliateId: string;
  payoutId: string;
  reason: string;
  actor: AffiliateActor;
}) {
  const db = await getDb();
  const updated = await db
    .update(affiliatePayouts)
    .set({
      status: "voided",
      voidedAt: new Date(),
      voidedByEmail: input.actor.email,
      voidReason: input.reason,
    })
    .where(
      and(
        eq(affiliatePayouts.id, input.payoutId),
        eq(affiliatePayouts.affiliateId, input.affiliateId),
        eq(affiliatePayouts.status, "recorded"),
      ),
    )
    .returning();
  if (!updated[0]) throw notFound("Repasse não encontrado ou já anulado");
  return updated[0];
}

/* ------------------------------------------------------------------------ */
/* Relatórios                                                                */
/* ------------------------------------------------------------------------ */

export type AffiliateTotals = {
  referred: number;
  converted: number;
  reverted: number;
  grossCents: number;
  adjustmentsCents: number;
  netCents: number;
  paidOutCents: number;
  balanceCents: number;
  availableCents: number;
  heldCents: number;
};

type Period = { from: Date; to: Date };

/** Mês AAAA-MM em Brasília, [início, fim). */
// ponytail: UTC-3 fixo (Brasil sem horário de verão desde 2019); Intl se voltar
export function brazilMonthPeriod(month: string): Period | null {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!match) return null;
  const year = Number(match[1]);
  const index = Number(match[2]) - 1;
  return {
    from: new Date(Date.UTC(year, index, 1, 3)),
    to: new Date(Date.UTC(year, index + 1, 1, 3)),
  };
}

/**
 * Totais por afiliado. Saldo e disponível são sempre acumulados; o período,
 * quando há, recorta indicações pela atribuição, créditos pela competência,
 * ajustes pelo lançamento e repasses pela data do repasse.
 */
export async function affiliateTotals(
  affiliateIds: string[],
  period?: Period | null,
): Promise<Map<string, AffiliateTotals & { period?: AffiliateTotals }>> {
  const result = new Map<string, AffiliateTotals & { period?: AffiliateTotals }>();
  if (affiliateIds.length === 0) return result;

  const all = await totalsQuery(affiliateIds, null);
  const ranged = period ? await totalsQuery(affiliateIds, period) : null;
  for (const id of affiliateIds) {
    result.set(id, { ...all.get(id)!, ...(ranged ? { period: ranged.get(id)! } : {}) });
  }
  return result;
}

async function totalsQuery(ids: string[], period: Period | null) {
  const db = await getDb();
  const inRange = (column: unknown) =>
    period
      ? sql`${column} >= ${period.from.getTime()} AND ${column} < ${period.to.getTime()}`
      : sql`1 = 1`;

  const [referred, commissions, adjustments, payouts, perTenant] = await Promise.all([
    db
      .select({ affiliateId: tenantAffiliations.affiliateId, total: sql<number>`count(*)` })
      .from(tenantAffiliations)
      .where(and(inArray(tenantAffiliations.affiliateId, ids), inRange(tenantAffiliations.attributedAt)))
      .groupBy(tenantAffiliations.affiliateId),
    db
      .select({
        affiliateId: affiliateCommissions.affiliateId,
        status: affiliateCommissions.status,
        gross: sql<number>`coalesce(sum(${affiliateCommissions.amountCents}), 0)`,
      })
      .from(affiliateCommissions)
      .where(and(inArray(affiliateCommissions.affiliateId, ids), inRange(affiliateCommissions.competenceAt)))
      .groupBy(affiliateCommissions.affiliateId, affiliateCommissions.status),
    db
      .select({
        affiliateId: affiliateCommissionAdjustments.affiliateId,
        status: affiliateCommissions.status,
        total: sql<number>`coalesce(sum(${affiliateCommissionAdjustments.amountCents}), 0)`,
      })
      .from(affiliateCommissionAdjustments)
      .innerJoin(
        affiliateCommissions,
        eq(affiliateCommissions.id, affiliateCommissionAdjustments.commissionId),
      )
      .where(
        and(
          inArray(affiliateCommissionAdjustments.affiliateId, ids),
          inRange(affiliateCommissionAdjustments.createdAt),
        ),
      )
      .groupBy(affiliateCommissionAdjustments.affiliateId, affiliateCommissions.status),
    db
      .select({
        affiliateId: affiliatePayouts.affiliateId,
        total: sql<number>`coalesce(sum(${affiliatePayouts.amountCents}), 0)`,
      })
      .from(affiliatePayouts)
      .where(
        and(
          inArray(affiliatePayouts.affiliateId, ids),
          eq(affiliatePayouts.status, "recorded"),
          inRange(affiliatePayouts.paidAt),
        ),
      )
      .groupBy(affiliatePayouts.affiliateId),
    // conversão: revenda com crédito; revertida: crédito líquido zerado
    db.all<{ affiliateId: string; tenants: number; reverted: number }>(sql`
      SELECT affiliate_id AS affiliateId, count(*) AS tenants,
        sum(CASE WHEN net <= 0 THEN 1 ELSE 0 END) AS reverted
      FROM (
        SELECT c.affiliate_id, c.tenant_id,
          sum(c.amount_cents) + coalesce(sum((SELECT sum(a.amount_cents)
            FROM affiliate_commission_adjustments a WHERE a.commission_id = c.id)), 0) AS net,
          min(c.competence_at) AS first_at
        FROM affiliate_commissions c
        WHERE c.affiliate_id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
        GROUP BY c.affiliate_id, c.tenant_id
      )
      WHERE ${period ? sql`first_at >= ${period.from.getTime()} AND first_at < ${period.to.getTime()}` : sql`1 = 1`}
      GROUP BY affiliate_id
    `),
  ]);

  const totals = new Map<string, AffiliateTotals>();
  for (const id of ids) {
    const sumWhere = <T extends { affiliateId: string; status: string }>(
      rows: T[],
      pick: (row: T) => number,
      status?: string,
    ) =>
      rows
        .filter((row) => row.affiliateId === id && (!status || row.status === status))
        .reduce((sum, row) => sum + Number(pick(row)), 0);

    const gross = sumWhere(commissions, (row) => row.gross);
    const adjusted = sumWhere(adjustments, (row) => row.total);
    const heldNet =
      sumWhere(commissions, (row) => row.gross, "held") +
      sumWhere(adjustments, (row) => row.total, "held");
    const paidOut = Number(payouts.find((row) => row.affiliateId === id)?.total ?? 0);
    const tenantsRow = perTenant.find((row) => row.affiliateId === id);
    const net = gross + adjusted;

    totals.set(id, {
      referred: Number(referred.find((row) => row.affiliateId === id)?.total ?? 0),
      converted: Number(tenantsRow?.tenants ?? 0),
      reverted: Number(tenantsRow?.reverted ?? 0),
      grossCents: gross,
      adjustmentsCents: adjusted,
      netCents: net,
      paidOutCents: paidOut,
      balanceCents: net - paidOut,
      availableCents: net - heldNet - paidOut,
      heldCents: heldNet,
    });
  }
  return totals;
}

export async function listAffiliatesWithTotals() {
  const db = await getDb();
  const rows = await db.select().from(affiliates).orderBy(asc(affiliates.name));
  const totals = await affiliateTotals(rows.map((row) => row.id));
  return rows.map((affiliate) => ({ affiliate, totals: totals.get(affiliate.id)! }));
}

export async function listAffiliateTenants(affiliateId: string) {
  const db = await getDb();
  return db
    .select({
      tenantId: tenants.id,
      tenantName: tenants.name,
      tenantStatus: tenants.status,
      attributedAt: tenantAffiliations.attributedAt,
      source: tenantAffiliations.source,
      commissionBps: tenantAffiliations.commissionBpsSnapshot,
      firstPaymentAt: sql<number | null>`(SELECT min(c.competence_at) FROM affiliate_commissions c
        WHERE c.affiliation_id = ${tenantAffiliations.id})`,
      netCents: sql<number>`coalesce((SELECT sum(c.amount_cents) FROM affiliate_commissions c
        WHERE c.affiliation_id = ${tenantAffiliations.id}), 0)
        + coalesce((SELECT sum(a.amount_cents) FROM affiliate_commission_adjustments a
        JOIN affiliate_commissions c ON c.id = a.commission_id
        WHERE c.affiliation_id = ${tenantAffiliations.id}), 0)`,
    })
    .from(tenantAffiliations)
    .innerJoin(tenants, eq(tenants.id, tenantAffiliations.tenantId))
    .where(eq(tenantAffiliations.affiliateId, affiliateId))
    .orderBy(desc(tenantAffiliations.attributedAt));
}

export type StatementEntry = {
  kind: "commission" | "adjustment" | "payout";
  id: string;
  at: number;
  amountCents: number;
  tenantName: string | null;
  baseCents: number | null;
  commissionBps: number | null;
  status: string | null;
  detail: string | null;
};

/** Extrato: créditos, ajustes e repasses numa linha do tempo só, paginada. */
export async function affiliateStatement(affiliateId: string, page: number, pageSize = 50) {
  const db = await getDb();
  const rows = await db.all<StatementEntry>(sql`
    SELECT * FROM (
      SELECT 'commission' AS kind, c.id, c.competence_at AS at, c.amount_cents AS amountCents,
        t.name AS tenantName, c.base_cents AS baseCents, c.commission_bps AS commissionBps,
        c.status, NULL AS detail
      FROM affiliate_commissions c LEFT JOIN tenants t ON t.id = c.tenant_id
      WHERE c.affiliate_id = ${affiliateId}
      UNION ALL
      SELECT 'adjustment', a.id, a.created_at, a.amount_cents, t.name, NULL, NULL, NULL, a.reason
      FROM affiliate_commission_adjustments a
      JOIN affiliate_commissions c ON c.id = a.commission_id
      LEFT JOIN tenants t ON t.id = c.tenant_id
      WHERE a.affiliate_id = ${affiliateId}
      UNION ALL
      SELECT 'payout', p.id, p.paid_at, -p.amount_cents, NULL, NULL, NULL, p.status,
        p.reference || coalesce(' · anulado: ' || p.void_reason, '')
      FROM affiliate_payouts p
      WHERE p.affiliate_id = ${affiliateId}
    )
    ORDER BY at DESC, id
    LIMIT ${pageSize + 1} OFFSET ${(page - 1) * pageSize}
  `);
  return { entries: rows.slice(0, pageSize), hasMore: rows.length > pageSize };
}
