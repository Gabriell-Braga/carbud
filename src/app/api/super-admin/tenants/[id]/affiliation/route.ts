import { actorFromContext, logAuditFor } from "@/lib/audit";
import { requireApiSuperAdmin } from "@/lib/auth/guards";
import { badRequest, jsonOk, withApi } from "@/lib/http";
import { correctAffiliation, getTenantAffiliation } from "@/lib/services/affiliates";
import { affiliationCorrectionSchema } from "@/lib/validation/affiliates";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const GET = withApi(async (_request: Request, { params }: Params) => {
  await requireApiSuperAdmin("platform:affiliates:read");
  const { id } = await params;
  const current = await getTenantAffiliation(id);
  return jsonOk({
    affiliation: current
      ? {
          affiliateId: current.affiliate.id,
          affiliateName: current.affiliate.name,
          code: current.affiliation.codeSnapshot,
          commissionBps: current.affiliation.commissionBpsSnapshot,
          attributedAt: current.affiliation.attributedAt.toISOString(),
          source: current.affiliation.source,
        }
      : null,
  });
});

/** Correção da origem: exige motivo e só vale antes de haver comissão. */
export const PATCH = withApi(async (request: Request, { params }: Params) => {
  const context = await requireApiSuperAdmin("platform:affiliates:write");
  const { id } = await params;

  const parsed = affiliationCorrectionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw badRequest("Dados inválidos", parsed.error.issues);

  const actor = actorFromContext(context);
  const { previous, next } = await correctAffiliation({
    tenantId: id,
    affiliateCode: parsed.data.affiliateCode,
    actor: { userId: actor?.userId ?? null, email: actor?.email ?? null },
  });

  await logAuditFor(
    context,
    {
      action: previous ? "affiliate.attribution.correct" : "affiliate.attribution.create",
      entity: "tenant_affiliation",
      entityId: id,
      tenantId: id,
      metadata: {
        reason: parsed.data.reason,
        from: previous
          ? {
              affiliateId: previous.affiliate.id,
              code: previous.affiliation.codeSnapshot,
              commissionBps: previous.affiliation.commissionBpsSnapshot,
              attributedAt: previous.affiliation.attributedAt.toISOString(),
            }
          : null,
        to: next
          ? { affiliateId: next.id, code: next.code, commissionBps: next.defaultCommissionBps }
          : null,
      },
    },
    request,
  );

  return jsonOk({ id });
});
