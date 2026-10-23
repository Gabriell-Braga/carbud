import { describe, expect, it } from "vitest";
import {
  asaasCommissionBase,
  classifyPaymentStatus,
  commissionCents,
  entitledCents,
  formatBps,
  generateAffiliateCode,
  isAffiliateCodeFormat,
  nextAdjustment,
  normalizeAffiliateCode,
  percentToBps,
  refundedCentsOf,
} from "./rules";

describe("código de afiliado", () => {
  it("gera no formato e sem caracteres ambíguos", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateAffiliateCode();
      expect(isAffiliateCodeFormat(code)).toBe(true);
      expect(code.slice(3)).not.toMatch(/[01ILO]/);
    }
  });

  it("descarta bytes enviesados em vez de usar módulo", () => {
    // 255 está acima do limite (248) e precisa ser pulado
    let call = 0;
    const code = generateAffiliateCode((size) => {
      call++;
      return new Uint8Array(size).fill(call === 1 ? 255 : 0);
    });
    expect(code).toBe("AF-2222222222");
  });

  it("normaliza caixa e espaço; vazio é ausência", () => {
    expect(normalizeAffiliateCode("  af-abc ")).toBe("AF-ABC");
    expect(normalizeAffiliateCode("   ")).toBeNull();
    expect(normalizeAffiliateCode(undefined)).toBeNull();
  });
});

describe("cálculo da comissão", () => {
  it("usa pontos-base e arredonda meio para cima", () => {
    expect(commissionCents(29_990, 1_000)).toBe(2_999);
    expect(commissionCents(5, 1_000)).toBe(1); // 0,5 centavo sobe
    expect(commissionCents(4, 1_000)).toBe(0);
    expect(commissionCents(10_000, 0)).toBe(0);
    expect(commissionCents(10_000, 10_000)).toBe(10_000);
  });

  it("recusa percentual fora da faixa e base fracionária", () => {
    expect(() => commissionCents(100, 10_001)).toThrow();
    expect(() => commissionCents(100, 12.5)).toThrow();
    expect(() => commissionCents(10.5, 1_000)).toThrow();
  });
});

describe("base do pagamento Asaas", () => {
  it("pagamento comum: o valor cobrado", () => {
    expect(asaasCommissionBase({ value: 299.9 })).toEqual({ baseCents: 29_990 });
  });

  it("pago com atraso: tira juros e multa", () => {
    expect(
      asaasCommissionBase({ value: 309.9, originalValue: 299.9, interestValue: 10 }),
    ).toEqual({ baseCents: 29_990 });
  });

  it("desconto aplicado: o valor pago, sem descontar de novo", () => {
    expect(
      asaasCommissionBase({ value: 269.91, originalValue: 299.9, discount: { value: 10 } }),
    ).toEqual({ baseCents: 26_991 });
  });

  it("sem certeza sobre desconto ou valor: revisão, nunca zero", () => {
    expect(asaasCommissionBase({ value: 299.9, discount: { value: 10 } })).toHaveProperty("review");
    expect(asaasCommissionBase({ value: 0 })).toHaveProperty("review");
    expect(asaasCommissionBase({})).toHaveProperty("review");
    expect(asaasCommissionBase({ value: 310, originalValue: 300 })).toHaveProperty("review");
  });
});

describe("direito e ajustes", () => {
  const bps = 1_000;

  it("só pagamento confirmado gera direito", () => {
    expect(classifyPaymentStatus("CONFIRMED")).toBe("paid");
    expect(classifyPaymentStatus("RECEIVED")).toBe("paid");
    for (const status of ["PENDING", "OVERDUE", "REFUNDED"]) {
      const paymentClass = classifyPaymentStatus(status);
      expect(entitledCents({ paymentClass, baseCents: 10_000, refundedCents: 0, bps })).toBe(0);
    }
    expect(classifyPaymentStatus("ALGO_NOVO")).toBe("unknown");
  });

  it("estorno parcial recalcula sobre o restante", () => {
    const refunded = refundedCentsOf(
      {
        status: "RECEIVED",
        refunds: [
          { status: "DONE", value: 33.33 },
          { status: "CANCELLED", value: 50 },
        ],
      },
      10_000,
    );
    expect(refunded).toBe(3_333);
    expect(entitledCents({ paymentClass: "paid", baseCents: 10_000, refundedCents: refunded, bps })).toBe(667);
  });

  it("estorno integral zera; reversão recompõe só o que foi reduzido", () => {
    const steps = [1_000, 0, 1_000];
    const adjustments: number[] = [];
    const keys = new Set<string>();
    for (const entitled of steps) {
      const next = nextAdjustment({ commissionId: "c1", originalCents: 1_000, adjustments, entitledCents: entitled });
      if (!next) continue;
      expect(keys.has(next.key)).toBe(false);
      keys.add(next.key);
      adjustments.push(next.amountCents);
    }
    expect(adjustments).toEqual([-1_000, 1_000]);
  });

  it("replay do mesmo estado não gera ajuste, e concorrência gera a mesma chave", () => {
    expect(nextAdjustment({ commissionId: "c1", originalCents: 1_000, adjustments: [-1_000], entitledCents: 0 })).toBeNull();
    const a = nextAdjustment({ commissionId: "c1", originalCents: 1_000, adjustments: [], entitledCents: 0 });
    const b = nextAdjustment({ commissionId: "c1", originalCents: 1_000, adjustments: [], entitledCents: 0 });
    expect(a?.key).toBe(b?.key);
  });
});

describe("percentual digitado", () => {
  it("converte em pontos-base sem ponto flutuante", () => {
    expect(percentToBps("10")).toBe(1_000);
    expect(percentToBps("12,5")).toBe(1_250);
    expect(percentToBps("0,07")).toBe(7);
    expect(percentToBps("0")).toBe(0);
  });

  it("recusa precisão demais e texto inválido em vez de arredondar", () => {
    expect(percentToBps("12,345")).toBeNull();
    expect(percentToBps("")).toBeNull();
    expect(percentToBps("-1")).toBeNull();
    expect(percentToBps("abc")).toBeNull();
  });

  it("mostra no formato brasileiro", () => {
    expect(formatBps(1_250)).toBe("12,5%");
    expect(formatBps(1_000)).toBe("10%");
  });
});
