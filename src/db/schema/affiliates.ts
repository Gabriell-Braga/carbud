import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createdAt, idColumn, updatedAt } from "./_shared";
import { tenants } from "./tenants";

/*
 * Programa de afiliados.
 *
 * Nenhuma tabela aqui apaga em cascata: comissão e repasse são histórico
 * financeiro, e revenda some por exclusão lógica. As referências ficam, e os
 * snapshots explicam o valor mesmo depois de nome ou percentual mudarem.
 */

export const AFFILIATE_STATUS = ["active", "inactive"] as const;
export type AffiliateStatus = (typeof AFFILIATE_STATUS)[number];

export const affiliates = sqliteTable(
  "affiliates",
  {
    id: idColumn(),
    /** Identificador público de indicação (AF-XXXXXXXXXX). Imutável e nunca reutilizado. */
    code: text("code").notNull(),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    notes: text("notes"),
    status: text("status").$type<AffiliateStatus>().notNull().default("active"),
    /** Pontos-base: 1000 = 10%. Vale para atribuições novas, não para as antigas. */
    defaultCommissionBps: integer("default_commission_bps").notNull(),
    createdByUserId: text("created_by_user_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("affiliates_code_unique").on(table.code),
    index("affiliates_status_idx").on(table.status),
  ],
);

export type Affiliate = typeof affiliates.$inferSelect;

export const AFFILIATION_SOURCES = ["tenant_create", "subscription", "admin"] as const;
export type AffiliationSource = (typeof AFFILIATION_SOURCES)[number];

/** Origem da revenda: no máximo uma, e pertence à revenda, não à assinatura. */
export const tenantAffiliations = sqliteTable(
  "tenant_affiliations",
  {
    id: idColumn(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    affiliateId: text("affiliate_id")
      .notNull()
      .references(() => affiliates.id),
    codeSnapshot: text("code_snapshot").notNull(),
    commissionBpsSnapshot: integer("commission_bps_snapshot").notNull(),
    attributedAt: integer("attributed_at", { mode: "timestamp_ms" }).notNull(),
    source: text("source").$type<AffiliationSource>().notNull(),
    createdByUserId: text("created_by_user_id"),
    createdByEmail: text("created_by_email"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("tenant_affiliations_tenant_unique").on(table.tenantId),
    index("tenant_affiliations_affiliate_idx").on(table.affiliateId, table.attributedAt),
  ],
);

export type TenantAffiliation = typeof tenantAffiliations.$inferSelect;

export const PAYMENT_FACT_SOURCES = ["asaas", "manual"] as const;
export type PaymentFactSource = (typeof PAYMENT_FACT_SOURCES)[number];

/**
 * Um pagamento, normalizado. A identidade é a do pagamento (payment.id no
 * Asaas), não a do evento: CONFIRMED e RECEIVED da mesma cobrança caem aqui
 * na mesma linha.
 */
export const affiliatePaymentFacts = sqliteTable(
  "affiliate_payment_facts",
  {
    id: idColumn(),
    source: text("source").$type<PaymentFactSource>().notNull(),
    /** sandbox | production no Asaas; "manual" para recebimento registrado no painel. */
    environment: text("environment").notNull(),
    sourcePaymentId: text("source_payment_id").notNull(),
    tenantId: text("tenant_id"),
    gatewayCustomerId: text("gateway_customer_id"),
    gatewaySubscriptionId: text("gateway_subscription_id"),
    currency: text("currency").notNull().default("BRL"),
    /** Status do gateway na última consulta (RECEIVED, REFUNDED...). */
    gatewayStatus: text("gateway_status").notNull(),
    /** Valor cobrado, como veio do gateway. */
    grossCents: integer("gross_cents").notNull().default(0),
    /** Base comissionável calculada; null quando não deu para definir com segurança. */
    baseCents: integer("base_cents"),
    /** Base informada pelo super-admin ao resolver uma revisão. Vence a calculada. */
    baseOverrideCents: integer("base_override_cents"),
    refundedCents: integer("refunded_cents").notNull().default(0),
    /** Primeira confirmação/recebimento. Fixada uma vez: é a competência da comissão. */
    effectiveAt: integer("effective_at", { mode: "timestamp_ms" }),
    reviewReason: text("review_reason"),
    lastCheckedAt: integer("last_checked_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("affiliate_payment_facts_source_unique").on(
      table.source,
      table.environment,
      table.sourcePaymentId,
    ),
    index("affiliate_payment_facts_tenant_idx").on(table.tenantId, table.effectiveAt),
  ],
);

export type AffiliatePaymentFact = typeof affiliatePaymentFacts.$inferSelect;

export const COMMISSION_STATUS = ["available", "held"] as const;
export type CommissionStatus = (typeof COMMISSION_STATUS)[number];

/** Crédito original: um por pagamento, nunca reescrito. Mudança vira ajuste. */
export const affiliateCommissions = sqliteTable(
  "affiliate_commissions",
  {
    id: idColumn(),
    paymentFactId: text("payment_fact_id")
      .notNull()
      .references(() => affiliatePaymentFacts.id),
    affiliationId: text("affiliation_id")
      .notNull()
      .references(() => tenantAffiliations.id),
    affiliateId: text("affiliate_id")
      .notNull()
      .references(() => affiliates.id),
    tenantId: text("tenant_id").notNull(),
    baseCents: integer("base_cents").notNull(),
    commissionBps: integer("commission_bps").notNull(),
    amountCents: integer("amount_cents").notNull(),
    competenceAt: integer("competence_at", { mode: "timestamp_ms" }).notNull(),
    /** held = contestação ou estorno em andamento: fora do disponível para repasse. */
    status: text("status").$type<CommissionStatus>().notNull().default("available"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("affiliate_commissions_fact_unique").on(table.paymentFactId),
    index("affiliate_commissions_affiliate_idx").on(table.affiliateId, table.competenceAt),
    index("affiliate_commissions_tenant_idx").on(table.tenantId),
  ],
);

export type AffiliateCommission = typeof affiliateCommissions.$inferSelect;

export const affiliateCommissionAdjustments = sqliteTable(
  "affiliate_commission_adjustments",
  {
    id: idColumn(),
    commissionId: text("commission_id")
      .notNull()
      .references(() => affiliateCommissions.id),
    affiliateId: text("affiliate_id")
      .notNull()
      .references(() => affiliates.id),
    /** commissionId:ordem:alvo — duas apurações simultâneas geram a mesma chave. */
    idempotencyKey: text("idempotency_key").notNull(),
    /** Assinado: estorno reduz, reversão comprovada recompõe. */
    amountCents: integer("amount_cents").notNull(),
    reason: text("reason").notNull(),
    sourceRef: text("source_ref"),
    actorUserId: text("actor_user_id"),
    actorEmail: text("actor_email"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("affiliate_adjustments_key_unique").on(table.idempotencyKey),
    index("affiliate_adjustments_commission_idx").on(table.commissionId),
    index("affiliate_adjustments_affiliate_idx").on(table.affiliateId, table.createdAt),
  ],
);

export type AffiliateCommissionAdjustment = typeof affiliateCommissionAdjustments.$inferSelect;

export const PAYOUT_STATUS = ["recorded", "voided"] as const;
export type PayoutStatus = (typeof PAYOUT_STATUS)[number];

/** Registro de dinheiro já pago por fora. O sistema não transfere nada. */
export const affiliatePayouts = sqliteTable(
  "affiliate_payouts",
  {
    id: idColumn(),
    affiliateId: text("affiliate_id")
      .notNull()
      .references(() => affiliates.id),
    amountCents: integer("amount_cents").notNull(),
    paidAt: integer("paid_at", { mode: "timestamp_ms" }).notNull(),
    reference: text("reference").notNull(),
    note: text("note"),
    status: text("status").$type<PayoutStatus>().notNull().default("recorded"),
    idempotencyKey: text("idempotency_key").notNull(),
    createdByUserId: text("created_by_user_id"),
    createdByEmail: text("created_by_email"),
    voidedAt: integer("voided_at", { mode: "timestamp_ms" }),
    voidedByEmail: text("voided_by_email"),
    voidReason: text("void_reason"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("affiliate_payouts_key_unique").on(table.idempotencyKey),
    index("affiliate_payouts_affiliate_idx").on(table.affiliateId, table.paidAt),
  ],
);

export type AffiliatePayout = typeof affiliatePayouts.$inferSelect;

export const PROCESSING_STATE = ["pending", "done", "failed", "review"] as const;
export type ProcessingState = (typeof PROCESSING_STATE)[number];

/**
 * Apuração de afiliados por evento, separada de `webhook_events.processedAt`:
 * a cobrança pode ter dado certo e a comissão não (ou o contrário), e cada
 * lado precisa poder ser refeito sem repetir o outro.
 */
export const affiliateEventProcessing = sqliteTable(
  "affiliate_event_processing",
  {
    /** id do evento no webhook, ou manual:<chave> para recebimento manual. */
    id: text("id").primaryKey(),
    source: text("source").$type<PaymentFactSource>().notNull(),
    sourcePaymentId: text("source_payment_id"),
    /** Ambiente do Asaas de onde veio o evento: é lá que o pagamento é consultado. */
    environment: text("environment").$type<"sandbox" | "production">(),
    eventType: text("event_type"),
    state: text("state").$type<ProcessingState>().notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    paymentFactId: text("payment_fact_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("affiliate_event_processing_state_idx").on(table.state, table.updatedAt)],
);

export type AffiliateEventProcessing = typeof affiliateEventProcessing.$inferSelect;
