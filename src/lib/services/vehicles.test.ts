import { describe, expect, it } from "vitest";
import { isBelowFipe } from "./vehicles";

describe("isBelowFipe", () => {
  const base = { priceCents: 90_000_00, priceOnRequest: false, fipePriceCents: 100_000_00 };

  it("preço menor que a FIPE salva entra", () => {
    expect(isBelowFipe(base)).toBe(true);
  });

  it("igual ou acima não entra", () => {
    expect(isBelowFipe({ ...base, priceCents: 100_000_00 })).toBe(false);
    expect(isBelowFipe({ ...base, priceCents: 110_000_00 })).toBe(false);
  });

  it("sem FIPE consultada, sem preço ou preço sob consulta não entra", () => {
    expect(isBelowFipe({ ...base, fipePriceCents: null })).toBe(false);
    expect(isBelowFipe({ ...base, priceCents: 0 })).toBe(false);
    expect(isBelowFipe({ ...base, priceOnRequest: true })).toBe(false);
  });
});
