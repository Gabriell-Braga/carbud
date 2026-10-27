import { z } from "zod";
import { BILLING_MODES, DISCOUNT_TYPES, PLAN_CYCLES } from "@/db/schema";
import { FEATURES, LIMITS, isFeatureOn, type PlanFeatures, type PlanLimits } from "@/lib/plans/catalog";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Limites do plano. Campo ausente ou `null` = ilimitado; é a mesma convenção
 * que `limitOf` usa para decidir se há teto.
 */
const limitsSchema = z.object(
  Object.fromEntries(
    LIMITS.map((limit) => [
      limit.key,
      z.number().int().min(0).max(1_000_000).nullable().optional(),
    ]),
  ) as Record<string, z.ZodTypeAny>,
);

/**
 * Funcionalidades. O formato de cada valor vem do catálogo — booleano para
 * liga/desliga, string para nível, número para cota — então um plano não pode
 * gravar "completo" num item que é liga/desliga.
 */
const featuresSchema = z.object(
  Object.fromEntries(
    FEATURES.map((feature) => {
      if (feature.kind === "boolean") {
        // plano antigo guarda quantidade em item que hoje é sim/não (ver
        // isFeatureOn); o editor reenvia o valor como veio e o salvar era recusado
        return [
          feature.key,
          z.preprocess(
            (value) => (value === null ? undefined : typeof value === "number" ? isFeatureOn(value) : value),
            z.boolean().optional(),
          ),
        ];
      }
      if (feature.kind === "number") {
        return [feature.key, z.number().int().min(0).max(100_000).nullable().optional()];
      }
      const values = feature.tiers.map((tier) => tier.value) as [string, ...string[]];
      return [feature.key, z.enum(values).nullable().optional()];
    }),
  ) as Record<string, z.ZodTypeAny>,
);

export const planSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do plano").max(60),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(slugPattern, "Use apenas letras minúsculas, números e hífen"),
  description: z.string().trim().max(280).nullable().optional(),
  priceCents: z.number().int().min(0).max(100_000_000),
  cycle: z.enum(PLAN_CYCLES),
  billingMode: z.enum(BILLING_MODES),
  trialDays: z.number().int().min(0).max(365),
  // o objeto e montado a partir do catalogo, entao o zod so consegue inferir
  // Record<string, unknown>; o schema do banco quer os tipos nomeados
  limits: limitsSchema.transform((value) => value as PlanLimits),
  features: featuresSchema.transform((value) => value as PlanFeatures),
  publicVisible: z.boolean(),
  highlighted: z.boolean(),
  active: z.boolean(),
  sortOrder: z.number().int().min(0).max(999),
});

export const planUpdateSchema = planSchema.partial();

export const couponSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(3)
      .max(40)
      .regex(/^[A-Za-z0-9_-]+$/, "Use apenas letras, números, hífen e underscore")
      .transform((value) => value.toUpperCase()),
    description: z.string().trim().max(160).nullable().optional(),
    discountType: z.enum(DISCOUNT_TYPES),
    /** Percentual (0-100) ou centavos, conforme o tipo. */
    discountValue: z.number().int().min(1),
    durationCycles: z.number().int().min(1).max(120).nullable().optional(),
    maxRedemptions: z.number().int().min(1).max(100_000).nullable().optional(),
    planIds: z.array(z.string()).optional(),
    expiresAt: z.string().datetime().nullable().optional(),
    active: z.boolean(),
  })
  .superRefine((value, ctx) => {
    // 120% de desconto passaria batido e viraria valor negativo no gateway
    if (value.discountType === "PERCENTAGE" && value.discountValue > 100) {
      ctx.addIssue({
        code: "custom",
        path: ["discountValue"],
        message: "Desconto percentual não pode passar de 100%",
      });
    }
  });

export const couponUpdateSchema = couponSchema;

export const platformSettingsSchema = z.object({
  finePercent: z.number().int().min(0).max(100),
  interestPercent: z.number().int().min(0).max(100),
  defaultTrialDays: z.number().int().min(0).max(365),
  gatewayNotifications: z.boolean(),
  defaultGraceDays: z.number().int().min(0).max(90),
});

export type PlanInput = z.infer<typeof planSchema>;
export type CouponInput = z.infer<typeof couponSchema>;
export type PlatformSettingsInput = z.infer<typeof platformSettingsSchema>;
