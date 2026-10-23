import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createdAt, idColumn, updatedAt } from "./_shared";
import { plans } from "./plans";
import { tenants } from "./tenants";

/** Espelha o ciclo de vida da assinatura no gateway. */
export const SUBSCRIPTION_STATUS = [
  "trialing",
  "active",
  "past_due",
  "canceled",
  "manual",
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUS)[number];

export const BILLING_TYPES = ["BOLETO", "CREDIT_CARD", "PIX", "UNDEFINED"] as const;
export type BillingType = (typeof BILLING_TYPES)[number];

/**
 * Assinatura da revenda.
 *
 * Guarda os identificadores do Asaas para conseguirmos reconciliar nos dois
 * sentidos: do webhook para cá (via externalReference) e daqui para lá
 * (cancelar, trocar de plano, alterar valor).
 */
export const subscriptions = sqliteTable(
  "subscriptions",
  {
    id: idColumn(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    planId: text("plan_id").references(() => plans.id, { onDelete: "set null" }),

    status: text("status").$type<SubscriptionStatus>().notNull().default("manual"),
    billingType: text("billing_type").$type<BillingType>().notNull().default("UNDEFINED"),

    /**
     * Ambiente do Asaas em que cliente e assinatura existem. Os ids de um não
     * existem no outro, então cancelar ou listar cobranças tem que ir para cá,
     * e não para o ambiente ativo agora. Null = anterior à chave de ambiente,
     * tratado como produção.
     */
    gatewayEnvironment: text("gateway_environment").$type<"sandbox" | "production">(),
    gatewayCustomerId: text("gateway_customer_id"),
    gatewaySubscriptionId: text("gateway_subscription_id"),

    priceCents: integer("price_cents").notNull().default(0),
    couponCode: text("coupon_code"),
    discountCents: integer("discount_cents").notNull().default(0),

    trialEndsAt: integer("trial_ends_at", { mode: "timestamp_ms" }),
    currentPeriodEnd: integer("current_period_end", { mode: "timestamp_ms" }),
    canceledAt: integer("canceled_at", { mode: "timestamp_ms" }),
    /** Último evento do gateway aplicado — ajuda a depurar divergência. */
    lastEventType: text("last_event_type"),
    lastEventAt: integer("last_event_at", { mode: "timestamp_ms" }),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("subscriptions_tenant_unique").on(table.tenantId),
    index("subscriptions_gateway_idx").on(table.gatewaySubscriptionId),
    index("subscriptions_customer_idx").on(table.gatewayCustomerId),
    index("subscriptions_status_idx").on(table.status),
  ],
);

export type Subscription = typeof subscriptions.$inferSelect;

/* ------------------------------------------------------------------------ */
/* Eventos de webhook                                                        */
/* ------------------------------------------------------------------------ */

/**
 * Idempotência do webhook.
 *
 * O Asaas reenvia evento até receber 200, e o webhook dele não é assinado —
 * só um token estático. Guardar o id do evento é o que impede pagamento
 * contado duas vezes.
 */
export const webhookEvents = sqliteTable(
  "webhook_events",
  {
    /** id do evento no gateway. */
    id: text("id").primaryKey(),
    provider: text("provider").notNull().default("asaas"),
    eventType: text("event_type").notNull(),
    tenantId: text("tenant_id"),
    payload: text("payload", { mode: "json" }).$type<Record<string, unknown>>(),
    processedAt: integer("processed_at", { mode: "timestamp_ms" }),
    error: text("error"),
    receivedAt: createdAt(),
  },
  (table) => [
    index("webhook_events_received_idx").on(table.receivedAt),
    index("webhook_events_tenant_idx").on(table.tenantId, table.receivedAt),
  ],
);

export type WebhookEvent = typeof webhookEvents.$inferSelect;
