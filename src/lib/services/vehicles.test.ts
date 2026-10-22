import { describe, expect, it } from "vitest";
import { inspectionCutoff, isBelowFipe, isInspected } from "./vehicles";

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

describe("isInspected", () => {
  const now = new Date("2026-10-22T12:00:00Z");
  const base = {
    inspectionReportKey: "tenants/t/inspections/a.pdf",
    inspectionResult: "approved" as const,
    inspectionDate: "2026-03-01",
  };

  it("laudo aprovado, com ou sem ressalvas, e com menos de um ano vale selo", () => {
    expect(isInspected(base, now)).toBe(true);
    expect(isInspected({ ...base, inspectionResult: "approved_with_notes" }, now)).toBe(true);
  });

  it("reprovado, sem PDF ou vencido não vale", () => {
    expect(isInspected({ ...base, inspectionResult: "rejected" }, now)).toBe(false);
    expect(isInspected({ ...base, inspectionReportKey: null }, now)).toBe(false);
    expect(isInspected({ ...base, inspectionDate: "2025-10-01" }, now)).toBe(false);
  });

  it("o corte é um ano antes de hoje", () => {
    expect(inspectionCutoff(now)).toBe("2025-10-22");
    expect(isInspected({ ...base, inspectionDate: "2025-10-22" }, now)).toBe(true);
  });
});
