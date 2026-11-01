import type { FinanceRow } from "./vehicle-finance";

const STATUS: Record<string, string> = {
  draft: "Rascunho",
  available: "Disponível",
  reserved: "Reservado",
  sold: "Vendido",
};

const money = (cents: number | null) =>
  cents == null ? "" : (cents / 100).toFixed(2).replace(".", ",");
const day = (value: string | null) => (value ? value.split("-").reverse().join("/") : "");

function cell(value: string) {
  return /[";\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Planilha no formato que o Excel brasileiro abre com dois cliques: `;` como
 * separador, vírgula decimal e BOM para os acentos não virarem lixo.
 */
export function financeCsv(rows: FinanceRow[]): string {
  const header = [
    "Veículo",
    "Ano",
    "Placa",
    "Situação",
    "Leilão",
    "De onde veio",
    "Data de entrada",
    "Valor de compra",
    "Custos",
    "Custo total",
    "Preço anunciado",
    "Data da venda",
    "Valor de venda",
    "Retorno do banco",
    "Lucro",
    "Margem %",
    "Comprador",
    "CPF/CNPJ",
    "Telefone",
  ];
  const lines = rows.map((row) =>
    [
      [row.brand, row.model, row.version].filter(Boolean).join(" "),
      row.years,
      row.licensePlate ?? "",
      STATUS[row.status] ?? row.status,
      row.isAuction ? "Sim" : "Não",
      row.purchaseSource ?? "",
      day(row.purchaseDate),
      money(row.purchasePriceCents),
      money(row.expensesCents),
      money(row.costCents),
      money(row.priceCents),
      day(row.saleDate),
      money(row.salePriceCents),
      money(row.bankReturnCents),
      money(row.profitCents),
      row.marginPct == null ? "" : row.marginPct.toFixed(1).replace(".", ","),
      row.buyerName ?? "",
      row.buyerDocument ?? "",
      row.buyerPhone ?? "",
    ]
      .map((value) => cell(String(value)))
      .join(";"),
  );
  return "﻿" + [header.join(";"), ...lines].join("\r\n") + "\r\n";
}
