import { logAuditFor } from "@/lib/audit";
import { requireApiSuperAdmin } from "@/lib/auth/guards";
import { badRequest, jsonOk, withApi } from "@/lib/http";
import { resolveFactReview } from "@/lib/services/affiliates";
import { factReviewSchema } from "@/lib/validation/affiliates";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Pagamento que o sistema não soube calcular: o super-admin informa a base. */
export const POST = withApi(async (request: Request, { params }: Params) => {
  const context = await requireApiSuperAdmin("platform:affiliates:write");
  const { id } = await params;

  const parsed = factReviewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw badRequest("Dados inválidos", parsed.error.issues);

  const fact = await resolveFactReview(id, parsed.data.baseCents);

  await logAuditFor(
    context,
    {
      action: "affiliate.commission.adjust",
      entity: "affiliate_payment_fact",
      entityId: id,
      tenantId: fact.tenantId,
      metadata: {
        baseCents: parsed.data.baseCents,
        reason: parsed.data.reason,
        reviewReason: fact.reviewReason,
        sourcePaymentId: fact.sourcePaymentId,
      },
    },
    request,
  );

  return jsonOk({ id });
});
