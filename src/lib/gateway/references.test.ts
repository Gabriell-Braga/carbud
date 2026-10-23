import { describe, expect, it } from "vitest";
import { brazilIsoDate } from "./brazil-date";
import { parsePaymentReference, promoNextDueDate, promoReference } from "./references";

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
