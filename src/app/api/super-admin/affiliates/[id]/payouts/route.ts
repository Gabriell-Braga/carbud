import { actorFromContext, logAuditFor } from "@/lib/audit";
import { requireApiSuperAdmin } from "@/lib/auth/guards";
import { badRequest, jsonOk, withApi } from "@/lib/http";
import { getAffiliate, recordPayout } from "@/lib/services/affiliates";
import { payoutSchema } from "@/lib/validation/affiliates";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Registra repasse já pago por fora. Não transfere dinheiro. */
export const POST = withApi(async (request: Request, { params }: Params) => {
  const context = await requireApiSuperAdmin("platform:affiliate-payouts:write");
  const { id } = await params;

  const parsed = payoutSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw badRequest("Dados inválidos", parsed.error.issues);
  await getAffiliate(id);

  const actor = actorFromContext(context);
  const { payout, created } = await recordPayout({
    affiliateId: id,
    amountCents: parsed.data.amountCents,
    paidAt: parsed.data.paidAt,
    reference: parsed.data.reference,
    note: parsed.data.note,
    idempotencyKey: parsed.data.idempotencyKey,
    actor: { userId: actor?.userId ?? null, email: actor?.email ?? null },
  });

  if (created) {
    await logAuditFor(
      context,
      {
        action: "affiliate.payout.record",
        entity: "affiliate_payout",
        entityId: payout.id,
        tenantId: null,
        metadata: {
          affiliateId: id,
          amountCents: payout.amountCents,
          paidAt: payout.paidAt.toISOString(),
          reference: payout.reference,
        },
      },
      request,
    );
  }

  return jsonOk({ id: payout.id, duplicate: !created });
});
