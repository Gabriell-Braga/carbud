import { getDb } from "@/db";
import { billingStatus, tenantSites, tenants, users } from "@/db/schema";
import { logAuditFor } from "@/lib/audit";
import { requireApiSuperAdmin } from "@/lib/auth/guards";
import { hashPassword } from "@/lib/auth/password";
import { sendWelcomeInvite } from "@/lib/services/invites";
import { badRequest, conflict, jsonOk, withApi } from "@/lib/http";
import { isSlugTaken, nextDueDate } from "@/lib/services/tenants";
import { isTemplateSelectable } from "@carbud/site-kit/manifests";
import { createTenantSchema } from "@/lib/validation/tenants";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export const POST = withApi(async (request: Request) => {
  const context = await requireApiSuperAdmin("platform:tenants:write");

  const parsed = createTenantSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw badRequest("Dados inválidos", parsed.error.issues);
  const input = parsed.data;

  if (!isTemplateSelectable(input.templateId)) {
    throw badRequest("Template indisponível para seleção");
  }
  if (await isSlugTaken(input.slug)) throw conflict("Já existe uma revenda com este slug");

  const wantsAdmin = Boolean(input.adminEmail && input.adminPassword);
  const db = await getDb();

  if (wantsAdmin) {
    const existingUser = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, input.adminEmail!))
      .limit(1);
    if (existingUser.length > 0) throw conflict("Já existe um usuário com este e-mail");
  }

  const created = await db
    .insert(tenants)
    .values({
      name: input.name,
      slug: input.slug,
      legalName: input.legalName,
      cnpj: input.cnpj,
      templateId: input.templateId,
      blockMode: input.blockMode,
      notes: input.notes,
      status: "active",
    })
    .returning();

  const tenant = created[0];

  await db.insert(tenantSites).values({
    tenantId: tenant.id,
    phone: input.phone,
    whatsapp: input.whatsapp,
    email: input.email || undefined,
    addressCity: input.addressCity,
    addressState: input.addressState,
  });

  await db.insert(billingStatus).values({
    tenantId: tenant.id,
    status: "adimplente",
    dueDay: input.dueDay,
    amountCents: input.amountCents,
    currentDueDate: nextDueDate(input.dueDay),
  });

  let adminUserId: string | null = null;
  if (wantsAdmin) {
    const { hash, salt } = await hashPassword(input.adminPassword!);
    const insertedUser = await db
      .insert(users)
      .values({
        tenantId: tenant.id,
        email: input.adminEmail!,
        name: input.adminName || input.name,
        passwordHash: hash,
        passwordSalt: salt,
        role: "revenda_admin",
        status: "active",
        mustChangePassword: true,
      })
      .returning({ id: users.id });
    adminUserId = insertedUser[0]?.id ?? null;

    if (adminUserId) {
      await sendWelcomeInvite({
        userId: adminUserId,
        name: input.adminName || input.name,
        email: input.adminEmail!,
        tenantName: input.name,
        invitedBy: context.user.name,
      });
    }
  }

  await logAuditFor(
    context,
    {
      action: "tenant.create",
      entity: "tenant",
      entityId: tenant.id,
      tenantId: tenant.id,
      metadata: { slug: tenant.slug, templateId: tenant.templateId, adminUserId },
    },
    request,
  );

  return jsonOk({ id: tenant.id, slug: tenant.slug, adminUserId });
});
