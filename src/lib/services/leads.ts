import { and, count, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { leads, users, type LeadStatus } from "@/db/schema";

export type LeadFilters = {
  search?: string;
  status?: LeadStatus;
  assignedToUserId?: string;
  /** Leads de quem está na equipe (a equipe é da pessoa, não do lead). */
  teamMemberIds?: string[];
  page?: number;
  pageSize?: number;
};

/** Sempre escopado por tenant_id — nenhuma revenda enxerga lead de outra. */
export async function listLeads(tenantId: string, filters: LeadFilters = {}) {
  const db = await getDb();
  const pageSize = Math.min(filters.pageSize ?? 25, 100);
  const page = Math.max(filters.page ?? 1, 1);

  const conditions = [eq(leads.tenantId, tenantId)];
  if (filters.status) conditions.push(eq(leads.status, filters.status));
  if (filters.assignedToUserId) conditions.push(eq(leads.assignedToUserId, filters.assignedToUserId));
  if (filters.teamMemberIds) {
    // equipe vazia não pode virar "sem filtro": devolve nada
    if (filters.teamMemberIds.length === 0) return { items: [], total: 0, page, pageSize };
    conditions.push(inArray(leads.assignedToUserId, filters.teamMemberIds));
  }
  if (filters.search) {
    const term = `%${filters.search.toLowerCase()}%`;
    conditions.push(
      or(
        like(sql`lower(${leads.name})`, term),
        like(leads.phone, term),
        like(sql`lower(${leads.email})`, term),
        like(sql`lower(${leads.vehicleLabel})`, term),
      )!,
    );
  }
  const where = and(...conditions);

  const [items, totalRows] = await Promise.all([
    db
      .select({
        id: leads.id,
        name: leads.name,
        phone: leads.phone,
        email: leads.email,
        message: leads.message,
        vehicleId: leads.vehicleId,
        vehicleLabel: leads.vehicleLabel,
        status: leads.status,
        source: leads.source,
        internalNotes: leads.internalNotes,
        assignedToUserId: leads.assignedToUserId,
        assignedToName: users.name,
        utm: leads.utm,
        createdAt: leads.createdAt,
      })
      .from(leads)
      .leftJoin(users, eq(users.id, leads.assignedToUserId))
      .where(where)
      .orderBy(desc(leads.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ value: count() }).from(leads).where(where),
  ]);

  return { items, total: totalRows[0]?.value ?? 0, page, pageSize };
}

export type LeadStats = Record<LeadStatus, number> & { total: number };

export async function getLeadStats(tenantId: string): Promise<LeadStats> {
  const db = await getDb();
  const rows = await db
    .select({ status: leads.status, value: count() })
    .from(leads)
    .where(eq(leads.tenantId, tenantId))
    .groupBy(leads.status);

  const byStatus = Object.fromEntries(rows.map((row) => [row.status, row.value]));

  return {
    new: byStatus.new ?? 0,
    in_progress: byStatus.in_progress ?? 0,
    won: byStatus.won ?? 0,
    lost: byStatus.lost ?? 0,
    total: rows.reduce((sum, row) => sum + row.value, 0),
  };
}

export async function getLead(tenantId: string, id: string) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(leads)
    .where(and(eq(leads.tenantId, tenantId), eq(leads.id, id)))
    .limit(1);
  return rows[0] ?? null;
}
