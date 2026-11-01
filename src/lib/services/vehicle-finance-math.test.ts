import { describe, expect, it } from "vitest";
import { computeMargin } from "./vehicle-finance-math";

describe("computeMargin", () => {
  it("soma retorno do banco na receita e despesas no custo", () => {
    const result = computeMargin({
      purchasePriceCents: 3_000_000,
      salePriceCents: 4_000_000,
      bankReturnCents: 100_000,
      expensesCents: 200_000,
    });
    expect(result.costCents).toBe(3_200_000);
    expect(result.revenueCents).toBe(4_100_000);
    expect(result.profitCents).toBe(900_000);
    expect(result.marginPct).toBeCloseTo(21.95, 2);
  });

  it("sem venda ou sem compra não inventa lucro", () => {
    const base = { bankReturnCents: null, expensesCents: 500 };
    expect(computeMargin({ ...base, purchasePriceCents: 1, salePriceCents: null }).profitCents).toBeNull();
    expect(computeMargin({ ...base, purchasePriceCents: null, salePriceCents: 1 }).profitCents).toBeNull();
  });
});
