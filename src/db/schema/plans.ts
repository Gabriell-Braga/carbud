import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createdAt, idColumn, updatedAt } from "./_shared";
import type { PlanFeatures, PlanLimits } from "@/lib/plans/catalog";
import type { EmailCopyOverrides } from "@/lib/email/templates";

/** Como a mensalidade é cobrada. */
export const BILLING_MODES = ["gateway", "manual"] as const;
export type BillingMode = (typeof BILLING_MODES)[number];

export const PLAN_CYCLES = ["MONTHLY", "QUARTERLY", "SEMIANNUALLY", "YEARLY"] as const;
export type PlanCycle = (typeof PLAN_CYCLES)[number];

/**
 * Plano comercial, editável pelo Painel Geral.
 *
 * `billingMode = manual` é o caso Enterprise: nada é criado no gateway, a
 * cobrança acontece por fora e o super-admin controla a situação na mão.
 */
export const plans = sqliteTable(
  "plans",
  {
    id: idColumn(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    priceCents: integer("price_cents").notNull().default(0),
    cycle: text("cycle").$type<PlanCycle>().notNull().default("MONTHLY"),
    billingMode: text("billing_mode").$type<BillingMode>().notNull().default("gateway"),
    trialDays: integer("trial_days").notNull().default(0),
    limits: text("limits", { mode: "json" }).$type<PlanLimits>(),
    features: text("features", { mode: "json" }).$type<PlanFeatures>(),
    /** Aparece na vitrine de contratação self-service. */
    publicVisible: integer("public_visible", { mode: "boolean" }).notNull().default(true),
    highlighted: integer("highlighted", { mode: "boolean" }).notNull().default(false),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("plans_slug_unique").on(table.slug),
    index("plans_active_idx").on(table.active, table.sortOrder),
  ],
);

export type Plan = typeof plans.$inferSelect;
export type NewPlan = typeof plans.$inferInsert;

/* ------------------------------------------------------------------------ */
/* Cupons                                                                    */
/* ------------------------------------------------------------------------ */

export const DISCOUNT_TYPES = ["PERCENTAGE", "FIXED"] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

/**
 * Cupom é feature nossa: o Asaas não tem cupom, só desconto por assinatura.
 * Na contratação traduzimos o cupom no campo `discount` da assinatura.
 */
export const coupons = sqliteTable(
  "coupons",
  {
    id: idColumn(),
    code: text("code").notNull(),
    description: text("description"),
    discountType: text("discount_type").$type<DiscountType>().notNull().default("PERCENTAGE"),
    /** Percentual (0-100) ou centavos, conforme `discountType`. */
    discountValue: integer("discount_value").notNull(),
    /** Por quantos ciclos vale; null = para sempre. */
    durationCycles: integer("duration_cycles"),
    maxRedemptions: integer("max_redemptions"),
    redemptions: integer("redemptions").notNull().default(0),
    /** Restringe a planos específicos; vazio = vale para todos. */
    planIds: text("plan_ids", { mode: "json" }).$type<string[]>(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("coupons_code_unique").on(table.code)],
);

export type Coupon = typeof coupons.$inferSelect;

/* ------------------------------------------------------------------------ */
/* Configurações da plataforma                                               */
/* ------------------------------------------------------------------------ */

/**
 * Linha única (`id = "default"`) com o que a operação precisa ajustar sem
 * deploy: multa, juros, trial padrão e comportamento do gateway.
 */
export const platformSettings = sqliteTable("platform_settings", {
  id: text("id").primaryKey().default("default"),
  /** Multa por atraso, em pontos percentuais (2 = 2%). */
  finePercent: integer("fine_percent").notNull().default(2),
  /** Juros de mora ao mês, em pontos percentuais. */
  interestPercent: integer("interest_percent").notNull().default(1),
  defaultTrialDays: integer("default_trial_days").notNull().default(0),
  /** Deixa o Asaas avisar o pagador por e-mail/SMS. */
  gatewayNotifications: integer("gateway_notifications", { mode: "boolean" })
    .notNull()
    .default(true),
  /** Dias entre o vencimento e a suspensão, quando o plano não define. */
  defaultGraceDays: integer("default_grace_days").notNull().default(5),
  /** Textos dos e-mails reescritos no Painel Geral — só o que difere do padrão. */
  emailTemplates: text("email_templates", { mode: "json" }).$type<EmailCopyOverrides>(),
  updatedAt: updatedAt(),
});

export type PlatformSettings = typeof platformSettings.$inferSelect;
