import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { plans } from "@/db/schema";
import { actorFromContext, logAuditFor } from "@/lib/audit";
import { requireApiTenant } from "@/lib/auth/guards";
import { contractSubscription } from "@/lib/gateway/subscribe";
import { badRequest, clientIp, forbidden, jsonOk, tooManyRequests, withApi } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { cardSignupSchema } from "@/lib/validation/card-signup";

export const dynamic = "force-dynamic";

/**
 * A revenda contrata sozinha, no cartão: R$ 5 agora e o valor do plano a
 * partir do mês seguinte, cobrado no mesmo cartão até cancelar.
 */
export const POST = withApi(async (request: Request) => {
  const context = await requireApiTenant("tenant:settings");
  // cartão é da revenda: super-admin em impersonation não digita por ela
  if (context.impersonating) throw forbidden("Contratação no cartão é feita pela própria revenda");

  // tentativa em série de cartões é o padrão de teste de cartão roubado
  const limit = await rateLimit(`card-signup:${context.tenant.id}`, 5, 3600);
  if (!limit.allowed) throw tooManyRequests("Muitas tentativas. Tente de novo em uma hora.");

  const parsed = cardSignupSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw badRequest("Dados inválidos", parsed.error.issues);
  const input = parsed.data;

  // só plano de vitrine e cobrado pelo gateway: negociado e interno não se contratam sozinhos
  const db = await getDb();
  const planRows = await db.select().from(plans).where(eq(plans.id, input.planId)).limit(1);
  const plan = planRows[0];
  if (!plan || !plan.active || !plan.publicVisible || plan.billingMode !== "gateway") {
    throw badRequest("Plano indisponível para contratação", [
      { path: ["planId"], message: "Plano indisponível" },
    ]);
  }

  const remoteIp = clientIp(request);
  if (!remoteIp) throw badRequest("Não foi possível identificar a conexão. Tente de novo.");

  const actor = actorFromContext(context);
  const result = await contractSubscription({
    tenantId: context.tenant.id,
    planId: plan.id,
    affiliateCode: input.affiliateCode || null,
    actor: { userId: actor?.userId ?? null, email: actor?.email ?? null },
    card: { creditCard: input.card, holderInfo: input.holder, remoteIp },
  });

  // nada do cartão entra na auditoria
  await logAuditFor(
    context,
    {
      action: "billing.subscription.create",
      entity: "subscription",
      entityId: context.tenant.id,
      tenantId: context.tenant.id,
      metadata: {
        planId: plan.id,
        mode: result.mode,
        via: "card_promo",
        environment: "environment" in result ? result.environment : null,
        promoPaymentId: "promoPaymentId" in result ? result.promoPaymentId : null,
      },
    },
    request,
  );

  if (result.affiliation?.created) {
    await logAuditFor(
      context,
      {
        action: "affiliate.attribution.create",
        entity: "tenant_affiliation",
        entityId: context.tenant.id,
        tenantId: context.tenant.id,
        metadata: { ...result.affiliation, source: "subscription" },
      },
      request,
    );
  }

  return jsonOk({ planName: result.planName, nextDueDate: result.nextDueDate });
});
