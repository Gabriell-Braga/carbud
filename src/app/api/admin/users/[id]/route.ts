import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { logAuditFor } from "@/lib/audit";
import { requireApiTenant } from "@/lib/auth/guards";
import { hashPassword } from "@/lib/auth/password";
import { assignableRoles } from "@/lib/auth/rbac";
import { badRequest, forbidden, jsonOk, notFound, withApi } from "@/lib/http";
import { requireFeature } from "@/lib/api/feature-guard";
import { TENANT_PERMISSIONS } from "@/lib/auth/rbac";
import { resetPasswordSchema, updateUserSchema } from "@/lib/validation/users";
import { assertTeam } from "@/lib/services/teams";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

async function loadTenantUser(tenantId: string, id: string) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(users)
    .where(and(eq(users.tenantId, tenantId), eq(users.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

export const PATCH = withApi(async (request: Request, { params }: Params) => {
  const context = await requireApiTenant("users:write");
  const { id } = await params;

  const parsed = updateUserSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw badRequest("Dados inválidos", parsed.error.issues);
  const input = parsed.data;

  const target = await loadTenantUser(context.tenant.id, id);
  if (!target) throw notFound("Usuário não encontrado");

  if (input.role && !assignableRoles(context.role).includes(input.role)) {
    throw forbidden("Você não pode atribuir este perfil");
  }
  // evita a revenda se trancar para fora do próprio painel
  if (
    target.id === context.claims.sub &&
    (input.status === "disabled" || input.role || input.permissionOverrides !== undefined)
  ) {
    throw forbidden("Você não pode alterar o próprio acesso");
  }

  if (input.permissionOverrides !== undefined) {
    await requireFeature(context.tenant.id, "permissoes_avancadas");

    // permissão fora do catálogo da revenda seria concedida sem que nenhuma
    // tela a mostrasse — inclusive as de plataforma
    const chosen = [
      ...(input.permissionOverrides?.granted ?? []),
      ...(input.permissionOverrides?.revoked ?? []),
    ];
    const invalid = chosen.filter(
      (permission) => !TENANT_PERMISSIONS.includes(permission as (typeof TENANT_PERMISSIONS)[number]),
    );
    if (invalid.length > 0) throw badRequest(`Permissão inválida: ${invalid.join(", ")}`);
  }

  if (input.teamId) await assertTeam(context.tenant.id, input.teamId);

  const db = await getDb();
  await db
    .update(users)
    .set({
      ...input,
      ...(input.status === "disabled" ? { sessionsValidFrom: new Date() } : {}),
    })
    .where(and(eq(users.tenantId, context.tenant.id), eq(users.id, id)));

  await logAuditFor(
    context,
    { action: "user.update", entity: "user", entityId: id, metadata: input },
    request,
  );

  return jsonOk({ id });
});

/** Redefine a senha de um usuário da revenda e encerra as sessões dele. */
export const PUT = withApi(async (request: Request, { params }: Params) => {
  const context = await requireApiTenant("users:write");
  const { id } = await params;

  const parsed = resetPasswordSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw badRequest("Dados inválidos", parsed.error.issues);

  const target = await loadTenantUser(context.tenant.id, id);
  if (!target) throw notFound("Usuário não encontrado");

  const { hash, salt } = await hashPassword(parsed.data.password);
  const db = await getDb();
  await db
    .update(users)
    .set({
      passwordHash: hash,
      passwordSalt: salt,
      mustChangePassword: parsed.data.mustChangePassword,
      sessionsValidFrom: new Date(),
    })
    .where(and(eq(users.tenantId, context.tenant.id), eq(users.id, id)));

  await logAuditFor(
    context,
    {
      action: "user.reset_password",
      entity: "user",
      entityId: id,
      metadata: { email: target.email },
    },
    request,
  );

  return jsonOk({ id });
});
