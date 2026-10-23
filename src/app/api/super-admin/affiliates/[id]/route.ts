import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { affiliates } from "@/db/schema";
import { logAuditFor } from "@/lib/audit";
import { requireApiSuperAdmin } from "@/lib/auth/guards";
import { badRequest, jsonOk, withApi } from "@/lib/http";
import { affiliateTotals, getAffiliate, listAffiliateTenants } from "@/lib/services/affiliates";
import { affiliateUpdateSchema } from "@/lib/validation/affiliates";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const GET = withApi(async (_request: Request, { params }: Params) => {
  await requireApiSuperAdmin("platform:affiliates:read");
  const { id } = await params;
  const affiliate = await getAffiliate(id);
  const [totals, referredTenants] = await Promise.all([
    affiliateTotals([id]),
    listAffiliateTenants(id),
  ]);
  return jsonOk({ affiliate, totals: totals.get(id), tenants: referredTenants });
});

/**
 * Edita cadastro e situação. Código não muda; percentual novo vale só para
 * atribuições futuras, porque cada vínculo guarda o seu.
 */
export const PATCH = withApi(async (request: Request, { params }: Params) => {
  const context = await requireApiSuperAdmin("platform:affiliates:write");
  const { id } = await params;

  const parsed = affiliateUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw badRequest("Dados inválidos", parsed.error.issues);

  const before = await getAffiliate(id);
  const db = await getDb();
  await db.update(affiliates).set(parsed.data).where(eq(affiliates.id, id));

  const deactivated = before.status === "active" && parsed.data.status === "inactive";
  await logAuditFor(
    context,
    {
      action: deactivated ? "affiliate.deactivate" : "affiliate.update",
      entity: "affiliate",
      entityId: id,
      tenantId: null,
      metadata: {
        changes: parsed.data,
        before: {
          name: before.name,
          status: before.status,
          defaultCommissionBps: before.defaultCommissionBps,
        },
      },
    },
    request,
  );

  return jsonOk({ id });
});
