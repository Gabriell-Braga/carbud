import { actorFromContext, logAuditFor } from "@/lib/audit";
import { requireApiSuperAdmin } from "@/lib/auth/guards";
import { badRequest, jsonOk, withApi } from "@/lib/http";
import { createAffiliate, listAffiliatesWithTotals } from "@/lib/services/affiliates";
import { affiliateCreateSchema } from "@/lib/validation/affiliates";

export const dynamic = "force-dynamic";

export const GET = withApi(async () => {
  await requireApiSuperAdmin("platform:affiliates:read");
  return jsonOk({ affiliates: await listAffiliatesWithTotals() });
});

/** O código sai do servidor: quem cadastra não escolhe nem edita. */
export const POST = withApi(async (request: Request) => {
  const context = await requireApiSuperAdmin("platform:affiliates:write");

  const parsed = affiliateCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw badRequest("Dados inválidos", parsed.error.issues);

  const actor = actorFromContext(context);
  const affiliate = await createAffiliate(parsed.data, {
    userId: actor?.userId ?? null,
    email: actor?.email ?? null,
  });

  await logAuditFor(
    context,
    {
      action: "affiliate.create",
      entity: "affiliate",
      entityId: affiliate.id,
      tenantId: null,
      metadata: { code: affiliate.code, commissionBps: affiliate.defaultCommissionBps },
    },
    request,
  );

  return jsonOk({ id: affiliate.id, code: affiliate.code });
});
