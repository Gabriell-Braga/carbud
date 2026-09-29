import { getDb } from "@/db";
import { users } from "@/db/schema";
import { logAuditFor } from "@/lib/audit";
import { sendWelcomeInvite } from "@/lib/services/invites";
import { requireApiSuperAdmin } from "@/lib/auth/guards";
import { hashPassword } from "@/lib/auth/password";
import { badRequest, conflict, jsonOk, withApi } from "@/lib/http";
import { isEmailTaken } from "@/lib/services/users";
import { createSuperAdminSchema } from "@/lib/validation/users";

export const dynamic = "force-dynamic";

/** Cria outro super-admin da plataforma. */
export const POST = withApi(async (request: Request) => {
  const context = await requireApiSuperAdmin("platform:users:write");

  const parsed = createSuperAdminSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw badRequest("Dados inválidos", parsed.error.issues);
  const input = parsed.data;

  if (await isEmailTaken(input.email)) throw conflict("Já existe um usuário com este e-mail");

  const db = await getDb();
  const { hash, salt } = await hashPassword(input.password);
  const created = await db
    .insert(users)
    .values({
      tenantId: null,
      email: input.email,
      name: input.name,
      passwordHash: hash,
      passwordSalt: salt,
      role: "super_admin",
      status: "active",
      mustChangePassword: true,
    })
    .returning({ id: users.id });

  await sendWelcomeInvite({
    userId: created[0].id,
    name: input.name,
    email: input.email,
    tenantName: null,
    invitedBy: context.user.name,
  });

  await logAuditFor(
    context,
    {
      action: "platform.user.create",
      entity: "user",
      entityId: created[0].id,
      tenantId: null,
      metadata: { email: input.email },
    },
    request,
  );

  return jsonOk({ id: created[0].id });
});
