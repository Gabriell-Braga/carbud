import { z } from "zod";
import { BILLING_TYPES } from "@/db/schema";
import { actorFromContext, logAuditFor } from "@/lib/audit";
import { affiliateCodeField } from "@/lib/validation/affiliates";
import { requireApiSuperAdmin } from "@/lib/auth/guards";
import { cancelTenantSubscription, contractSubscription } from "@/lib/gateway/subscribe";
import { badRequest, jsonOk, withApi } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const contractSchema = z.object({
  planId: z.string().min(1),
  billingType: z.enum(BILLING_TYPES).optional(),
  couponCode: z.string().trim().max(40).optional().or(z.literal("")),
  dueDay: z.coerce.number().int().min(1).max(28).optional(),
  affiliateCode: affiliateCodeField,
});

/** Contrata um plano para a revenda. */
export const POST = withApi(async (request: Request, { params }: Params) => {
  const context = await requireApiSuperAdmin("platform:billing:write");
  const { id } = await params;

  const parsed = contractSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw badRequest("Dados inválidos", parsed.error.issues);

  const result = await contractSubscription({
    tenantId: id,
    planId: parsed.data.planId,
    billingType: parsed.data.billingType,
    couponCode: parsed.data.couponCode || null,
    dueDay: parsed.data.dueDay,
    affiliateCode: parsed.data.affiliateCode || null,
    actor: {
      userId: actorFromContext(context)?.userId ?? null,
      email: actorFromContext(context)?.email ?? null,
    },
  });

  if (result.affiliation?.created) {
    await logAuditFor(
      context,
      {
        action: "affiliate.attribution.create",
        entity: "tenant_affiliation",
        entityId: id,
        tenantId: id,
        metadata: { ...result.affiliation, source: "subscription" },
      },
      request,
    );
  }

  await logAuditFor(
    context,
    {
      action: "billing.subscription.create",
      entity: "subscription",
      entityId: id,
      tenantId: id,
      metadata: { planId: parsed.data.planId, mode: result.mode },
    },
    request,
  );

  return jsonOk(result);
});

/** Cancela a assinatura e devolve a revenda ao controle manual. */
export const DELETE = withApi(async (request: Request, { params }: Params) => {
  const context = await requireApiSuperAdmin("platform:billing:write");
  const { id } = await params;

  const result = await cancelTenantSubscription(id);

  await logAuditFor(
    context,
    {
      action: "billing.subscription.cancel",
      entity: "subscription",
      entityId: id,
      tenantId: id,
    },
    request,
  );

  return jsonOk(result);
});
