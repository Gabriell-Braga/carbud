import { describe, expect, it } from "vitest";
import { couponSchema, planSchema, planUpdateSchema, platformSettingsSchema } from "./plans";

const basePlan = {
  name: "Performance",
  slug: "performance",
  description: null,
  priceCents: 39900,
  cycle: "MONTHLY",
  billingMode: "gateway",
  trialDays: 7,
  limits: { maxVehicles: 120, maxUsers: null },
  features: { gestao_estoque: true, crm_leads: "completo" },
  publicVisible: true,
  highlighted: false,
  active: true,
  sortOrder: 1,
};

describe("planSchema", () => {
  it("aceita um plano completo", () => {
    const result = planSchema.safeParse(basePlan);
    expect(result.success).toBe(true);
  });

  it("recusa slug com maiúscula ou espaço", () => {
    for (const slug of ["Performance", "plano premium", "plano_premium", "-x"]) {
      expect(planSchema.safeParse({ ...basePlan, slug }).success).toBe(false);
    }
  });

  it("recusa nível inexistente numa funcionalidade de nível", () => {
    const result = planSchema.safeParse({
      ...basePlan,
      features: { crm_leads: "supremo" },
    });
    expect(result.success).toBe(false);
  });

  it("recusa texto numa funcionalidade de liga/desliga", () => {
    const result = planSchema.safeParse({
      ...basePlan,
      features: { gestao_estoque: "completo" },
    });
    expect(result.success).toBe(false);
  });

  it("trata limite nulo como ilimitado, sem virar zero", () => {
    const result = planSchema.parse({ ...basePlan, limits: { maxUsers: null } });
    expect(result.limits.maxUsers).toBeNull();
  });
});

describe("couponSchema", () => {
  const baseCoupon = {
    code: "lancamento10",
    discountType: "PERCENTAGE" as const,
    discountValue: 10,
    active: true,
  };

  it("normaliza o código para maiúsculas", () => {
    expect(couponSchema.parse(baseCoupon).code).toBe("LANCAMENTO10");
  });

  it("recusa desconto percentual acima de 100", () => {
    const result = couponSchema.safeParse({ ...baseCoupon, discountValue: 120 });
    expect(result.success).toBe(false);
  });

  it("aceita valor fixo alto, que é em centavos", () => {
    const result = couponSchema.safeParse({
      ...baseCoupon,
      discountType: "FIXED",
      discountValue: 15000,
    });
    expect(result.success).toBe(true);
  });
});

describe("platformSettingsSchema", () => {
  it("aceita zerar multa e juros", () => {
    const result = platformSettingsSchema.safeParse({
      finePercent: 0,
      interestPercent: 0,
      defaultTrialDays: 0,
      gatewayNotifications: false,
      defaultGraceDays: 0,
    });
    expect(result.success).toBe(true);
  });

  it("recusa percentual negativo", () => {
    const result = platformSettingsSchema.safeParse({
      finePercent: -1,
      interestPercent: 1,
      defaultTrialDays: 0,
      gatewayNotifications: true,
      defaultGraceDays: 5,
    });
    expect(result.success).toBe(false);
  });
});

describe("planUpdateSchema com plano antigo", () => {
  it("aceita quantidade em funcionalidade que hoje é sim/não", () => {
    const parsed = planUpdateSchema.parse({ features: { whatsapp_integrado: 3, api_webhooks: 0 } });
    expect(parsed.features).toMatchObject({ whatsapp_integrado: true, api_webhooks: false });
  });

  it("continua recusando nível que não existe", () => {
    expect(planUpdateSchema.safeParse({ features: { suporte: "vip" } }).success).toBe(false);
  });
});
