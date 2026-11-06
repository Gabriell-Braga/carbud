import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { teams, users } from "@/db/schema";
import { badRequest, notFound } from "@/lib/http";

export async function listTeams(tenantId: string) {
  const db = await getDb();
  return db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(eq(teams.tenantId, tenantId))
    .orderBy(asc(teams.name));
}

export async function assertTeam(tenantId: string, teamId: string) {
  const db = await getDb();
  const rows = await db
    .select({ id: teams.id })
    .from(teams)
    .where(and(eq(teams.tenantId, tenantId), eq(teams.id, teamId)))
    .limit(1);
  if (!rows[0]) throw badRequest("Equipe inválida");
}

export async function createTeam(tenantId: string, name: string) {
  const db = await getDb();
  const created = await db.insert(teams).values({ tenantId, name }).returning({ id: teams.id });
  return created[0].id;
}

export async function renameTeam(tenantId: string, id: string, name: string) {
  const db = await getDb();
  const updated = await db
    .update(teams)
    .set({ name })
    .where(and(eq(teams.tenantId, tenantId), eq(teams.id, id)))
    .returning({ id: teams.id });
  if (!updated[0]) throw notFound("Equipe não encontrada");
}

/** Apagar a equipe só solta as pessoas: ninguém perde acesso nem lead. */
export async function deleteTeam(tenantId: string, id: string) {
  const db = await getDb();
  await db
    .update(users)
    .set({ teamId: null })
    .where(and(eq(users.tenantId, tenantId), eq(users.teamId, id)));
  await db.delete(teams).where(and(eq(teams.tenantId, tenantId), eq(teams.id, id)));
}

/** Ids de quem está na equipe — é por eles que lead e agenda filtram. */
export async function teamMemberIds(tenantId: string, teamId: string): Promise<string[]> {
  const db = await getDb();
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.tenantId, tenantId), eq(users.teamId, teamId)));
  return rows.map((row) => row.id);
}
