import { describe, expect, it } from "vitest";
import { brazilIsoDate } from "./brazil-date";
import {
  couponAppliesTo,
  firstPaymentCents,
  parsePaymentReference,
  promoNextDueDate,
  promoReference,
  type CheckoutCoupon,
} from "./references";

describe("referência do pagamento promocional", () => {
  it("ida e volta identifica revenda e promoção", () => {
    expect(parsePaymentReference(promoReference("t1"))).toEqual({ tenantId: "t1", promo: true });
    expect(parsePaymentReference("t1")).toEqual({ tenantId: "t1", promo: false });
    expect(parsePaymentReference(null)).toEqual({ tenantId: null, promo: false });
    expect(parsePaymentReference("promo:")).toEqual({ tenantId: null, promo: true });
  });
});

describe("vencimento depois do promocional", () => {
  it("mesmo dia no mês seguinte", () => {
    expect(brazilIsoDate(promoNextDueDate(new Date("2026-10-23T15:00:00Z")))).toBe("2026-11-23");
  });

  it("dia 29 a 31 vira 28 e dezembro vira o ano", () => {
    expect(brazilIsoDate(promoNextDueDate(new Date("2026-01-31T15:00:00Z")))).toBe("2026-02-28");
    expect(brazilIsoDate(promoNextDueDate(new Date("2026-12-15T15:00:00Z")))).toBe("2027-01-15");
  });

  it("conta o dia em Brasília, não em UTC", () => {
    // 22h de 31/10 em Brasília já é 01/11 em UTC
    expect(brazilIsoDate(promoNextDueDate(new Date("2026-11-01T01:00:00Z")))).toBe("2026-11-28");
  });
});

describe("primeiro pagamento com cupom", () => {
  const coupon: CheckoutCoupon = {
    code: "X",
    discountType: "PERCENTAGE",
    discountValue: 0,
    firstPaymentCents: 500,
    planIds: null,
  };

  it("sem cupom cobra a mensalidade cheia", () => {
    expect(firstPaymentCents(29_900, null)).toBe(29_900);
  });

  it("cupom promocional cobra o valor dele", () => {
    expect(firstPaymentCents(29_900, coupon)).toBe(500);
  });

  it("cupom só de desconto cobra a mensalidade com desconto", () => {
    const off = { ...coupon, firstPaymentCents: null, discountValue: 10 };
    expect(firstPaymentCents(29_900, off)).toBe(26_910);
    expect(firstPaymentCents(1_000, { ...off, discountType: "FIXED", discountValue: 5_000 })).toBe(0);
  });

  it("cupom restrito vale só para os planos dele", () => {
    expect(couponAppliesTo({ ...coupon, planIds: ["a"] }, "a")).toBe(true);
    expect(couponAppliesTo({ ...coupon, planIds: ["a"] }, "b")).toBe(false);
    expect(couponAppliesTo({ ...coupon, planIds: [] }, "b")).toBe(true);
  });
});
