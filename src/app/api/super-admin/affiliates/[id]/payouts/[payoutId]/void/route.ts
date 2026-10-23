import { actorFromContext, logAuditFor } from "@/lib/audit";
import { requireApiSuperAdmin } from "@/lib/auth/guards";
import { badRequest, jsonOk, withApi } from "@/lib/http";
import { voidPayout } from "@/lib/services/affiliates";
import { voidPayoutSchema } from "@/lib/validation/affiliates";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; payoutId: string }> };

/** Anula um registro de repasse lançado por engano. O registro continua no extrato. */
export const POST = withApi(async (request: Request, { params }: Params) => {
  const context = await requireApiSuperAdmin("platform:affiliate-payouts:write");
  const { id, payoutId } = await params;

  const parsed = voidPayoutSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw badRequest("Dados inválidos", parsed.error.issues);

  const actor = actorFromContext(context);
  const payout = await voidPayout({
    affiliateId: id,
    payoutId,
    reason: parsed.data.reason,
    actor: { userId: actor?.userId ?? null, email: actor?.email ?? null },
  });

  await logAuditFor(
    context,
    {
      action: "affiliate.payout.void",
      entity: "affiliate_payout",
      entityId: payoutId,
      tenantId: null,
      metadata: { affiliateId: id, amountCents: payout.amountCents, reason: parsed.data.reason },
    },
    request,
  );

  return jsonOk({ id: payoutId });
});
