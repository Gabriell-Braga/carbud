import { describe, expect, it } from "vitest";
import { financeCsv } from "./finance-csv";
import type { FinanceRow } from "./vehicle-finance";

const row: FinanceRow = {
  vehicleId: "v1",
  brand: "Fiat",
  model: "Uno",
  version: 'Way 1.0 "Fire"',
  years: "2015/2016",
  licensePlate: "ABC1D23",
  status: "sold",
  isAuction: true,
  priceCents: 4_000_000,
  purchasePriceCents: 3_000_000,
  purchaseDate: "2026-01-05",
  purchaseSource: "Leilão; pátio X",
  expensesCents: 150_050,
  salePriceCents: 3_900_000,
  bankReturnCents: null,
  saleDate: "2026-02-10",
  buyerName: "Fulano",
  buyerDocument: "123.456.789-00",
  buyerPhone: null,
  costCents: 3_150_050,
  revenueCents: 3_900_000,
  profitCents: 749_950,
  marginPct: 19.229,
};

describe("financeCsv", () => {
  it("gera ; com vírgula decimal, datas BR e escapa aspas e ;", () => {
    const [header, line] = financeCsv([row]).replace("﻿", "").split("\r\n");
    expect(header.split(";")).toHaveLength(19);
    expect(line).toContain('"Fiat Uno Way 1.0 ""Fire"""');
    expect(line).toContain('"Leilão; pátio X"');
    expect(line).toContain(";05/01/2026;30000,00;1500,50;31500,50;");
    expect(line).toContain(";7499,50;19,2;Fulano;");
  });

  it("começa com BOM para o Excel ler os acentos", () => {
    expect(financeCsv([]).startsWith("﻿")).toBe(true);
  });
});
