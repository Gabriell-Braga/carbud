import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createdAt, idColumn, updatedAt } from "./_shared";
import { tenants } from "./tenants";
import { vehicles } from "./vehicles";

/*
 * Compra, venda e custos do carro: o "ERP" que as lojas pediram (quanto pagou,
 * de onde veio, quanto gastou, quanto lucrou).
 *
 * Mora fora de `vehicles` de propósito. A tabela de veículos é lida por site,
 * portal, feed dos portais e API v1; número de compra e margem não podem vazar
 * por um `select()` esquecido em nenhum desses caminhos. Aqui só chega quem
 * tem `finance:read`.
 */
export const vehicleFinance = sqliteTable(
  "vehicle_finance",
  {
    vehicleId: text("vehicle_id")
      .primaryKey()
      .references(() => vehicles.id, { onDelete: "cascade" }),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    purchasePriceCents: integer("purchase_price_cents"),
    /** `AAAA-MM-DD` */
    purchaseDate: text("purchase_date"),
    /** De quem/onde veio: leilão, troca, particular, outra loja. Texto livre. */
    purchaseSource: text("purchase_source"),
    salePriceCents: integer("sale_price_cents"),
    /** `AAAA-MM-DD` */
    saleDate: text("sale_date"),
    buyerName: text("buyer_name"),
    buyerDocument: text("buyer_document"),
    buyerPhone: text("buyer_phone"),
    /** Retorno do banco no financiamento; entra como receita na margem. */
    bankReturnCents: integer("bank_return_cents"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("vehicle_finance_tenant_sale_idx").on(table.tenantId, table.saleDate)],
);

export type VehicleFinance = typeof vehicleFinance.$inferSelect;

export const vehicleExpenses = sqliteTable(
  "vehicle_expenses",
  {
    id: idColumn(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    vehicleId: text("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    description: text("description"),
    amountCents: integer("amount_cents").notNull(),
    /** `AAAA-MM-DD` */
    date: text("date").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index("vehicle_expenses_vehicle_idx").on(table.vehicleId, table.date),
    index("vehicle_expenses_tenant_idx").on(table.tenantId, table.date),
  ],
);

export type VehicleExpense = typeof vehicleExpenses.$inferSelect;

/**
 * Custos da loja que não são de um carro: aluguel, salário, luz, contador.
 * Entram no lucro líquido do período na tela Financeiro.
 */
export const storeExpenses = sqliteTable(
  "store_expenses",
  {
    id: idColumn(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    description: text("description"),
    amountCents: integer("amount_cents").notNull(),
    /** `AAAA-MM-DD` (vencimento ou pagamento) */
    date: text("date").notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("store_expenses_tenant_idx").on(table.tenantId, table.date)],
);

export type StoreExpense = typeof storeExpenses.$inferSelect;
