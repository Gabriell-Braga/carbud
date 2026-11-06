import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { passwordResets, tenants, users, type Role, type User } from "@/db/schema";

export type UserListItem = Pick<
  User,
  | "id"
  | "name"
  | "email"
  | "role"
  | "status"
  | "lastLoginAt"
  | "mustChangePassword"
  | "createdAt"
  | "storeId"
  | "teamId"
  | "receivesLeads"
  | "permissionOverrides"
>;

const LIST_COLUMNS = {
  id: users.id,
  name: users.name,
  email: users.email,
  role: users.role,
  status: users.status,
  lastLoginAt: users.lastLoginAt,
  mustChangePassword: users.mustChangePassword,
  createdAt: users.createdAt,
  storeId: users.storeId,
  teamId: users.teamId,
  receivesLeads: users.receivesLeads,
  permissionOverrides: users.permissionOverrides,
};

export async function listTenantUsers(tenantId: string): Promise<UserListItem[]> {
  const db = await getDb();
  return db
    .select(LIST_COLUMNS)
    .from(users)
    .where(eq(users.tenantId, tenantId))
    .orderBy(desc(users.createdAt));
}

export async function listPlatformUsers(): Promise<UserListItem[]> {
  const db = await getDb();
  return db
    .select(LIST_COLUMNS)
    .from(users)
    .where(and(isNull(users.tenantId), eq(users.role, "super_admin" as Role)))
    .orderBy(desc(users.createdAt));
}

export async function isEmailTaken(email: string, exceptUserId?: string): Promise<boolean> {
  const db = await getDb();
  const rows = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  const found = rows[0];
  if (!found) return false;
  return found.id !== exceptUserId;
}

export type PendingReset = {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  tenantName: string | null;
  delivered: boolean;
  createdAt: Date;
  expiresAt: Date;
};

/**
 * Pedidos de redefinição em aberto.
 * O token é guardado só como hash, então o link não pode ser recuperado —
 * esta lista serve para o super-admin saber que alguém está travado e
 * resolver pelo botão de redefinir senha.
 */
export async function listPendingPasswordResets(limit = 20): Promise<PendingReset[]> {
  const db = await getDb();
  const rows = await db
    .select({
      id: passwordResets.id,
      userId: users.id,
      userName: users.name,
      userEmail: users.email,
      tenantName: tenants.name,
      delivered: passwordResets.delivered,
      createdAt: passwordResets.createdAt,
      expiresAt: passwordResets.expiresAt,
    })
    .from(passwordResets)
    .innerJoin(users, eq(users.id, passwordResets.userId))
    .leftJoin(tenants, eq(tenants.id, users.tenantId))
    .where(and(isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, new Date())))
    .orderBy(desc(passwordResets.createdAt))
    .limit(limit);

  return rows;
}
