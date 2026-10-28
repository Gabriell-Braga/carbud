import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { newId, plans, tenantAffiliations, tenantSites, tenants, users } from "@/db/schema";
import { logAudit, type AuditActor } from "@/lib/audit";
import { setSessionCookie } from "@/lib/auth/cookies";
import { hashPassword } from "@/lib/auth/password";
import { createSessionToken } from "@/lib/auth/session";
import { contractSubscription } from "@/lib/gateway/subscribe";
import { ApiError, badRequest, clientIp, jsonOk, tooManyRequests, withApi } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { isSlugTaken } from "@/lib/services/tenants";
import { verifyTurnstile } from "@/lib/security/turnstile";
import { slugify } from "@/lib/utils";
import { TERMS_VERSION, checkoutSchema } from "@/lib/validation/checkout";
import { slugSchema } from "@/lib/validation/tenants";

export const dynamic = "force-dynamic";

/**
 * Contratação vinda da página de planos (Webflow): cria a revenda e o acesso
 * de quem contratou, cobra o primeiro mês promocional no cartão e já entra no
 * painel. Pagamento recusado desfaz o cadastro, para a pessoa poder tentar de
 * novo com o mesmo e-mail e nenhuma revenda ficar no ar sem ter pago.
 */
export const POST = withApi(async (request: Request) => {
  const remoteIp = clientIp(request);
  if (!remoteIp) throw badRequest("Não foi possível identificar a conexão. Tente de novo.");

  // rota aberta que cobra cartão: o limite por IP é a defesa contra teste de cartão
  const limit = await rateLimit(`checkout:ip:${remoteIp}`, 5, 3600);
  if (!limit.allowed) throw tooManyRequests("Muitas tentativas. Tente de novo em uma hora.");

  const parsed = checkoutSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw badRequest("Dados inválidos", parsed.error.issues);
  const { account, ...input } = parsed.data;

  if (!(await verifyTurnstile(input.captchaToken, remoteIp))) {
    throw badRequest("Não conseguimos confirmar que você não é um robô. Tente de novo.");
  }

  const db = await getDb();
  const planRows = await db.select().from(plans).where(eq(plans.id, input.planId)).limit(1);
  const plan = planRows[0];
  if (!plan || !plan.active || !plan.publicVisible || plan.billingMode !== "gateway") {
    throw badRequest("Plano indisponível para contratação", [
      { path: ["planId"], message: "Plano indisponível" },
    ]);
  }

  const existingUser = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, account.email))
    .limit(1);
  if (existingUser[0]) {
    throw badRequest("Dados inválidos", [
      { path: ["account", "email"], message: "Este e-mail já tem acesso. Entre no painel para contratar." },
    ]);
  }

  const tenantId = newId();
  const userId = newId();
  const slug = await availableSlug(account.storeName);
  const { hash, salt } = await hashPassword(account.password);

  await db.batch([
    db.insert(tenants).values({
      id: tenantId,
      name: account.storeName,
      slug,
      cnpj: account.document,
      status: "active",
    }),
    db.insert(tenantSites).values({
      tenantId,
      email: account.email,
      whatsapp: input.holder.phone,
      addressZip: input.holder.postalCode,
      addressNumber: input.holder.addressNumber,
    }),
    db.insert(users).values({
      id: userId,
      tenantId,
      email: account.email,
      name: account.name,
      passwordHash: hash,
      passwordSalt: salt,
      role: "revenda_admin",
      status: "active",
      mustChangePassword: false,
    }),
  ]);

  const actor: AuditActor = {
    userId,
    email: account.email,
    role: "revenda_admin",
    tenantId,
    impersonated: false,
  };

  let result;
  try {
    result = await contractSubscription({
      tenantId,
      planId: plan.id,
      affiliateCode: input.affiliateCode || null,
      actor: { userId, email: account.email },
      card: { creditCard: input.card, holderInfo: input.holder, remoteIp },
    });
  } catch (error) {
    // recusa do gateway ou dado inválido: nada foi cobrado (ou o promocional já
    // foi estornado). Erro inesperado mantém o cadastro para conferência.
    if (error instanceof ApiError) {
      await db.delete(tenantAffiliations).where(eq(tenantAffiliations.tenantId, tenantId));
      await db.delete(tenants).where(eq(tenants.id, tenantId));
    }
    throw error;
  }

  await logAudit(
    actor,
    {
      action: "tenant.create",
      entity: "tenant",
      entityId: tenantId,
      tenantId,
      metadata: { slug, adminUserId: userId, source: "checkout", termsVersion: TERMS_VERSION },
    },
    request,
  );
  // nada do cartão entra na auditoria
  await logAudit(
    actor,
    {
      action: "billing.subscription.create",
      entity: "subscription",
      entityId: tenantId,
      tenantId,
      metadata: {
        planId: plan.id,
        mode: result.mode,
        via: "checkout",
        environment: "environment" in result ? result.environment : null,
        promoPaymentId: "promoPaymentId" in result ? result.promoPaymentId : null,
      },
    },
    request,
  );
  if (result.affiliation?.created) {
    await logAudit(
      actor,
      {
        action: "affiliate.attribution.create",
        entity: "tenant_affiliation",
        entityId: tenantId,
        tenantId,
        metadata: { ...result.affiliation, source: "subscription" },
      },
      request,
    );
  }

  const token = await createSessionToken({
    sub: userId,
    email: account.email,
    name: account.name,
    role: "revenda_admin",
    tenantId,
  });
  await setSessionCookie(token);

  return jsonOk({
    planName: result.planName,
    nextDueDate: result.nextDueDate,
    redirectTo: "/admin",
    // vira o transaction_id do purchase no GA4: o pagamento cobrado agora
    transactionId: ("promoPaymentId" in result ? result.promoPaymentId : null) ?? tenantId,
  });
});

/** Slug a partir do nome da revenda; homônimas ganham sufixo. */
async function availableSlug(storeName: string): Promise<string> {
  let base = slugify(storeName).slice(0, 34).replace(/-+$/, "");
  if (!slugSchema.safeParse(base).success) base = `revenda-${base}`.replace(/-+$/, "");

  for (let attempt = 1; attempt <= 5; attempt++) {
    const candidate = attempt === 1 ? base : `${base}-${attempt}`;
    if (!(await isSlugTaken(candidate))) return candidate;
  }
  return `${base}-${crypto.randomUUID().slice(0, 6)}`;
}
