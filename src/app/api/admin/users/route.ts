import { getDb } from "@/db";
import { users } from "@/db/schema";
import { logAuditFor } from "@/lib/audit";
import { requireApiTenant } from "@/lib/auth/guards";
import { hashPassword } from "@/lib/auth/password";
import { assignableRoles } from "@/lib/auth/rbac";
import { badRequest, conflict, forbidden, jsonOk, withApi } from "@/lib/http";
import { sendWelcomeInvite } from "@/lib/services/invites";
import { isEmailTaken } from "@/lib/services/users";
import { checkTenantLimit } from "@/lib/plans/service";
import { createUserSchema } from "@/lib/validation/users";

export const dynamic = "force-dynamic";

/** Criação de usuário pela própria revenda. */
export const POST = withApi(async (request: Request) => {
  const context = await requireApiTenant("users:write");

  const parsed = createUserSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw badRequest("Dados inválidos", parsed.error.issues);
  const input = parsed.data;

  if (!assignableRoles(context.role).includes(input.role)) {
    throw forbidden("Você não pode criar usuários com este perfil");
  }
  const limit = await checkTenantLimit(context.tenant.id, "maxUsers");
  if (!limit.allowed) throw forbidden(limit.message!);

  if (await isEmailTaken(input.email)) throw conflict("Já existe um usuário com este e-mail");

  const db = await getDb();
  const { hash, salt } = await hashPassword(input.password);
  const created = await db
    .insert(users)
    .values({
      tenantId: context.tenant.id,
      email: input.email,
      name: input.name,
      passwordHash: hash,
      passwordSalt: salt,
      role: input.role,
      status: "active",
      mustChangePassword: input.mustChangePassword,
    })
    .returning({ id: users.id });

  await sendWelcomeInvite({
    userId: created[0].id,
    name: input.name,
    email: input.email,
    tenantName: context.tenant.name,
    invitedBy: context.user.name,
  });

  await logAuditFor(
    context,
    {
      action: "user.create",
      entity: "user",
      entityId: created[0].id,
      metadata: { email: input.email, role: input.role },
    },
    request,
  );

  return jsonOk({ id: created[0].id });
});
