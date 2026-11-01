import { and, asc, desc, eq, gte, like, lte, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { storeExpenses, vehicleExpenses, vehicleFinance, vehicles, type VehicleStatus } from "@/db/schema";
import type { FinanceFilters, VehicleFinanceInput } from "@/lib/validation/finance";
import { computeMargin } from "./vehicle-finance-math";

export { computeMargin };

export async function getVehicleFinance(tenantId: string, vehicleId: string) {
  const db = await getDb();
  const [finance, expenses] = await Promise.all([
    db
      .select()
      .from(vehicleFinance)
      .where(and(eq(vehicleFinance.tenantId, tenantId), eq(vehicleFinance.vehicleId, vehicleId)))
      .limit(1),
    db
      .select()
      .from(vehicleExpenses)
      .where(and(eq(vehicleExpenses.tenantId, tenantId), eq(vehicleExpenses.vehicleId, vehicleId)))
      .orderBy(asc(vehicleExpenses.date), asc(vehicleExpenses.createdAt)),
  ]);
  return { finance: finance[0] ?? null, expenses };
}

/** O chamador garante que o veículo é da revenda. */
export async function saveVehicleFinance(
  tenantId: string,
  vehicleId: string,
  input: VehicleFinanceInput,
) {
  const db = await getDb();
  await db
    .insert(vehicleFinance)
    .values({ ...input, tenantId, vehicleId })
    .onConflictDoUpdate({
      target: vehicleFinance.vehicleId,
      set: { ...input, updatedAt: new Date() },
    });
}

export async function addVehicleExpense(
  tenantId: string,
  vehicleId: string,
  input: { category: string; description?: string | null; amountCents: number; date: string },
) {
  const db = await getDb();
  const created = await db
    .insert(vehicleExpenses)
    .values({ ...input, tenantId, vehicleId })
    .returning();
  return created[0];
}

export async function deleteVehicleExpense(tenantId: string, vehicleId: string, id: string) {
  const db = await getDb();
  const removed = await db
    .delete(vehicleExpenses)
    .where(
      and(
        eq(vehicleExpenses.tenantId, tenantId),
        eq(vehicleExpenses.vehicleId, vehicleId),
        eq(vehicleExpenses.id, id),
      ),
    )
    .returning({ id: vehicleExpenses.id });
  return removed[0] ?? null;
}

export type FinanceRow = {
  vehicleId: string;
  brand: string;
  model: string;
  version: string | null;
  years: string;
  licensePlate: string | null;
  status: VehicleStatus;
  isAuction: boolean;
  priceCents: number;
  purchasePriceCents: number | null;
  purchaseDate: string | null;
  purchaseSource: string | null;
  expensesCents: number;
  salePriceCents: number | null;
  bankReturnCents: number | null;
  saleDate: string | null;
  buyerName: string | null;
  buyerDocument: string | null;
  buyerPhone: string | null;
  costCents: number;
  revenueCents: number | null;
  profitCents: number | null;
  marginPct: number | null;
};

/**
 * Uma linha por carro com compra, custos, venda e margem.
 *
 * ponytail: limite fixo de linhas e conta no JS; paginar e agregar em SQL
 * quando uma revenda passar de alguns milhares de carros no filtro.
 */
export async function listFinanceRows(
  tenantId: string,
  filters: FinanceFilters,
  limit = 1000,
): Promise<FinanceRow[]> {
  const db = await getDb();
  const expenses = db
    .select({
      vehicleId: vehicleExpenses.vehicleId,
      total: sql<number>`sum(${vehicleExpenses.amountCents})`.as("total"),
    })
    .from(vehicleExpenses)
    .where(eq(vehicleExpenses.tenantId, tenantId))
    .groupBy(vehicleExpenses.vehicleId)
    .as("expenses");

  const conditions = [
    eq(vehicles.tenantId, tenantId),
    // rascunho provisório (fotos sem ficha salva) ainda não é carro da loja
    sql`${vehicles.draftExpiresAt} is null`,
  ];
  const sold = sql`(${vehicles.status} = 'sold' or ${vehicleFinance.saleDate} is not null)`;
  if (filters.situation === "vendidos") conditions.push(sold);
  if (filters.situation === "estoque") conditions.push(sql`not ${sold}`);
  if (filters.from) conditions.push(gte(vehicleFinance.saleDate, filters.from));
  if (filters.to) conditions.push(lte(vehicleFinance.saleDate, filters.to));
  if (filters.q) {
    const term = `%${filters.q}%`;
    const plate = filters.q.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const digits = filters.q.replace(/\D/g, "");
    const documentColumn = sql`replace(replace(replace(${vehicleFinance.buyerDocument}, '.', ''), '-', ''), '/', '')`;
    conditions.push(
      or(
        like(vehicles.brand, term),
        like(vehicles.model, term),
        like(vehicles.version, term),
        like(vehicleFinance.buyerName, term),
        like(vehicleFinance.purchaseSource, term),
        ...(plate.length >= 3 ? [like(vehicles.licensePlate, `%${plate}%`)] : []),
        ...(digits.length >= 3 ? [sql`${documentColumn} like ${`%${digits}%`}`] : []),
      )!,
    );
  }

  const rows = await db
    .select({
      vehicleId: vehicles.id,
      brand: vehicles.brand,
      model: vehicles.model,
      version: vehicles.version,
      yearManufacture: vehicles.yearManufacture,
      yearModel: vehicles.yearModel,
      licensePlate: vehicles.licensePlate,
      status: vehicles.status,
      isAuction: vehicles.isAuction,
      priceCents: vehicles.priceCents,
      purchasePriceCents: vehicleFinance.purchasePriceCents,
      purchaseDate: vehicleFinance.purchaseDate,
      purchaseSource: vehicleFinance.purchaseSource,
      salePriceCents: vehicleFinance.salePriceCents,
      bankReturnCents: vehicleFinance.bankReturnCents,
      saleDate: vehicleFinance.saleDate,
      buyerName: vehicleFinance.buyerName,
      buyerDocument: vehicleFinance.buyerDocument,
      buyerPhone: vehicleFinance.buyerPhone,
      expensesCents: expenses.total,
    })
    .from(vehicles)
    .leftJoin(vehicleFinance, eq(vehicleFinance.vehicleId, vehicles.id))
    .leftJoin(expenses, eq(expenses.vehicleId, vehicles.id))
    .where(and(...conditions))
    .orderBy(desc(sql`coalesce(${vehicleFinance.saleDate}, '')`), desc(vehicles.createdAt))
    .limit(limit);

  return rows.map(({ yearManufacture, yearModel, ...row }) => {
    const expensesCents = Number(row.expensesCents ?? 0);
    return {
      ...row,
      years: `${yearManufacture}/${yearModel}`,
      expensesCents,
      ...computeMargin({ ...row, expensesCents }),
    };
  });
}

export function summarizeFinance(rows: FinanceRow[]) {
  let revenueCents = 0;
  let costCents = 0;
  let profitCents = 0;
  let soldCount = 0;
  let stockCostCents = 0;
  for (const row of rows) {
    if (row.profitCents != null) {
      soldCount += 1;
      revenueCents += row.revenueCents ?? 0;
      costCents += row.costCents;
      profitCents += row.profitCents;
    } else if (row.status !== "sold" && !row.saleDate) {
      // dinheiro parado no pátio: o que já saiu do caixa por carro não vendido
      stockCostCents += row.costCents;
    }
  }
  return {
    soldCount,
    revenueCents,
    costCents,
    profitCents,
    marginPct: revenueCents > 0 ? (profitCents / revenueCents) * 100 : null,
    stockCostCents,
  };
}

/** Custos da loja no período (datas inclusivas; sem período, tudo). */
export async function listStoreExpenses(tenantId: string, period: { from?: string; to?: string }) {
  const db = await getDb();
  const conditions = [eq(storeExpenses.tenantId, tenantId)];
  if (period.from) conditions.push(gte(storeExpenses.date, period.from));
  if (period.to) conditions.push(lte(storeExpenses.date, period.to));
  return db
    .select()
    .from(storeExpenses)
    .where(and(...conditions))
    .orderBy(desc(storeExpenses.date), desc(storeExpenses.createdAt))
    .limit(2000);
}

export async function addStoreExpense(
  tenantId: string,
  input: { category: string; description?: string | null; amountCents: number; date: string },
) {
  const db = await getDb();
  const created = await db
    .insert(storeExpenses)
    .values({ ...input, tenantId })
    .returning();
  return created[0];
}

export async function deleteStoreExpense(tenantId: string, id: string) {
  const db = await getDb();
  const removed = await db
    .delete(storeExpenses)
    .where(and(eq(storeExpenses.tenantId, tenantId), eq(storeExpenses.id, id)))
    .returning({ id: storeExpenses.id });
  return removed[0] ?? null;
}
