import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  billingStatus,
  coupons,
  plans,
  subscriptions,
  tenantSites,
  tenants,
  type BillingType,
  type Plan,
} from "@/db/schema";
import { ApiError, badRequest, conflict } from "@/lib/http";
import {
  attachAffiliation,
  resolveAffiliateForAttribution,
  type AffiliateActor,
} from "@/lib/services/affiliates";
import { billingDate, brazilDateParts } from "./brazil-date";
import { getPlatformSettings, invalidateEntitlements } from "@/lib/plans/service";
import { invalidateTenantCache } from "@/lib/tenant/service";
import { onlyDigits } from "@/lib/utils";
import {
  cancelSubscription as cancelAtGateway,
  createCustomer,
  createSubscription,
  updateCustomer,
  type AsaasCycle,
} from "./asaas";

export type ContractInput = {
  tenantId: string;
  planId: string;
  billingType?: BillingType;
  couponCode?: string | null;
  /** Dia do vencimento; sem isso usa o que já está na cobrança da revenda. */
  dueDay?: number;
  /** Código de afiliado de origem. Vazio preserva a origem que já existir. */
  affiliateCode?: string | null;
  actor?: AffiliateActor;
};

/**
 * Contrata um plano para a revenda.
 *
 * Plano em modo `manual` (Enterprise) não toca no gateway: registra a
 * assinatura localmente e a cobrança acontece por fora.
 */
export async function contractSubscription(input: ContractInput) {
  const db = await getDb();

  const rows = await db
    .select({ tenant: tenants, site: tenantSites, billing: billingStatus })
    .from(tenants)
    .leftJoin(tenantSites, eq(tenantSites.tenantId, tenants.id))
    .leftJoin(billingStatus, eq(billingStatus.tenantId, tenants.id))
    .where(eq(tenants.id, input.tenantId))
    .limit(1);

  const row = rows[0];
  if (!row || row.tenant.status === "deleted") throw badRequest("Revenda não encontrada");

  const planRows = await db.select().from(plans).where(eq(plans.id, input.planId)).limit(1);
  const plan = planRows[0];
  if (!plan) throw badRequest("Plano não encontrado");
  if (!plan.active) throw badRequest("Plano inativo");

  const existing = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.tenantId, input.tenantId))
    .limit(1);
  if (existing[0]?.gatewaySubscriptionId) {
    throw conflict("Esta revenda já tem assinatura ativa no gateway. Cancele antes de trocar.");
  }

  const settings = await getPlatformSettings();
  const dueDay = input.dueDay ?? row.billing?.dueDay ?? 10;
  const trialDays = plan.trialDays || settings.defaultTrialDays;
  const nextDueDate = firstDueDate(dueDay, trialDays);

  const discount = await resolveCoupon(input.couponCode, plan);
  const priceCents = plan.priceCents;
  const affiliate = input.affiliateCode
    ? await resolveAffiliateForAttribution(input.affiliateCode)
    : null;

  /* ------------------------------------------------ plano fora do gateway */
  if (plan.billingMode === "manual") {
    const affiliation = await recordAffiliation(input, affiliate);
    await saveSubscription({
      tenantId: input.tenantId,
      planId: plan.id,
      status: "manual",
      billingType: input.billingType ?? "UNDEFINED",
      priceCents,
      couponCode: discount?.code ?? null,
      discountCents: 0,
      trialEndsAt: trialDays > 0 ? nextDueDate : null,
      currentPeriodEnd: nextDueDate,
      gatewayCustomerId: null,
      gatewaySubscriptionId: null,
    });

    await applyPlanToTenant(input.tenantId, plan, priceCents, dueDay, nextDueDate);
    return { mode: "manual" as const, planName: plan.name, nextDueDate, affiliation };
  }

  /* ---------------------------------------------------- plano com gateway */
  const cpfCnpj = onlyDigits(row.tenant.cnpj ?? "");
  if (cpfCnpj.length !== 14 && cpfCnpj.length !== 11) {
    throw badRequest("Informe o CNPJ da revenda antes de contratar: o gateway exige.");
  }

  const customerInput = {
    name: row.tenant.legalName || row.tenant.name,
    cpfCnpj,
    email: row.site?.email ?? null,
    mobilePhone: row.site?.whatsapp ? onlyDigits(row.site.whatsapp) : null,
    postalCode: row.site?.addressZip ? onlyDigits(row.site.addressZip) : null,
    address: row.site?.addressStreet ?? null,
    addressNumber: row.site?.addressNumber ?? null,
    complement: row.site?.addressComplement ?? null,
    province: row.site?.addressDistrict ?? null,
    externalReference: row.tenant.id,
    notifications: settings.gatewayNotifications,
  };

  /*
   * A origem é gravada antes da primeira chamada que pode gerar cobrança: se o
   * Asaas falhar depois, a indicação fica e a nova tentativa não a duplica; se
   * o webhook chegar antes desta função terminar, a comissão já acha o vínculo.
   */
  const affiliation = await recordAffiliation(input, affiliate);

  const customer = existing[0]?.gatewayCustomerId
    ? await updateCustomer(existing[0].gatewayCustomerId, customerInput)
    : await createCustomer(customerInput);

  const subscription = await createSubscription({
    customerId: customer.id,
    billingType: (input.billingType ?? "UNDEFINED") as BillingType,
    valueCents: priceCents,
    nextDueDate,
    cycle: plan.cycle as AsaasCycle,
    description: `${plan.name} · ${row.tenant.name}`,
    externalReference: row.tenant.id,
    finePercent: settings.finePercent,
    interestPercent: settings.interestPercent,
    discount: discount
      ? { type: discount.type, value: discount.value }
      : null,
  });

  await saveSubscription({
    tenantId: input.tenantId,
    planId: plan.id,
    status: trialDays > 0 ? "trialing" : "active",
    billingType: (input.billingType ?? "UNDEFINED") as BillingType,
    priceCents,
    couponCode: discount?.code ?? null,
    discountCents: discount?.centsOff ?? 0,
    trialEndsAt: trialDays > 0 ? nextDueDate : null,
    currentPeriodEnd: nextDueDate,
    gatewayCustomerId: customer.id,
    gatewaySubscriptionId: subscription.id,
  });

  if (discount) await burnCoupon(discount.code);
  await applyPlanToTenant(input.tenantId, plan, priceCents, dueDay, nextDueDate);

  return {
    mode: "gateway" as const,
    planName: plan.name,
    nextDueDate,
    gatewayCustomerId: customer.id,
    gatewaySubscriptionId: subscription.id,
    affiliation,
  };
}

async function recordAffiliation(
  input: ContractInput,
  affiliate: Awaited<ReturnType<typeof resolveAffiliateForAttribution>> | null,
) {
  if (!affiliate) return null;
  const { created } = await attachAffiliation({
    tenantId: input.tenantId,
    affiliate,
    source: "subscription",
    actor: input.actor ?? { userId: null, email: null },
  });
  return { affiliateId: affiliate.id, code: affiliate.code, created };
}

/** Cancela no gateway e devolve a revenda ao controle manual. */
export async function cancelTenantSubscription(tenantId: string) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.tenantId, tenantId))
    .limit(1);

  const subscription = rows[0];
  if (!subscription) throw badRequest("Revenda sem assinatura registrada");

  if (subscription.gatewaySubscriptionId) {
    try {
      await cancelAtGateway(subscription.gatewaySubscriptionId);
    } catch (error) {
      // já cancelada no gateway não pode travar o cancelamento aqui
      if (!(error instanceof ApiError) && !(error as { status?: number })?.status) throw error;
    }
  }

  await db
    .update(subscriptions)
    .set({ status: "canceled", canceledAt: new Date(), gatewaySubscriptionId: null })
    .where(eq(subscriptions.tenantId, tenantId));

  return { canceled: true };
}

/* ------------------------------------------------------------------------ */

async function saveSubscription(values: {
  tenantId: string;
  planId: string;
  status: "trialing" | "active" | "manual";
  billingType: BillingType;
  priceCents: number;
  couponCode: string | null;
  discountCents: number;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date;
  gatewayCustomerId: string | null;
  gatewaySubscriptionId: string | null;
}) {
  const db = await getDb();
  const existing = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(eq(subscriptions.tenantId, values.tenantId))
    .limit(1);

  if (existing[0]) {
    await db
      .update(subscriptions)
      .set({ ...values, canceledAt: null })
      .where(eq(subscriptions.tenantId, values.tenantId));
    return;
  }
  await db.insert(subscriptions).values(values);
}

/** Espelha o plano na revenda e na cobrança, que é o que a régua consulta. */
async function applyPlanToTenant(
  tenantId: string,
  plan: Plan,
  priceCents: number,
  dueDay: number,
  nextDueDate: Date,
) {
  const db = await getDb();

  await db.update(tenants).set({ planId: plan.id }).where(eq(tenants.id, tenantId));

  const existing = await db
    .select({ tenantId: billingStatus.tenantId, amountCents: billingStatus.amountCents })
    .from(billingStatus)
    .where(eq(billingStatus.tenantId, tenantId))
    .limit(1);

  /**
   * Plano negociado tem preço zero no catálogo — o valor é combinado caso a
   * caso. Escrever esse zero por cima apagaria a mensalidade já acordada, e a
   * régua passaria a cobrar nada sem ninguém perceber.
   */
  const agreed = existing[0]?.amountCents ?? 0;
  const amountCents = priceCents > 0 ? priceCents : agreed;

  const values = {
    status: "adimplente" as const,
    amountCents,
    dueDay,
    currentDueDate: nextDueDate,
  };

  if (existing[0]) {
    await db.update(billingStatus).set(values).where(eq(billingStatus.tenantId, tenantId));
  } else {
    await db.insert(billingStatus).values({ tenantId, ...values });
  }

  const tenantRow = await db
    .select({ id: tenants.id, slug: tenants.slug })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  if (tenantRow[0]) await invalidateTenantCache(tenantRow[0]);
  await invalidateEntitlements(tenantId);
}

/**
 * Primeiro vencimento: respeita o trial e o dia escolhido.
 *
 * A comparação é por DATA e no fuso de Brasília. Por timestamp, contratar às 9h
 * cobrava no mesmo dia e às 21h empurrava um mês. Em UTC, o mesmo erro voltava
 * das 21h à meia-noite, quando o UTC já está no dia seguinte — e cada
 * ocorrência é um mês de mensalidade que ninguém cobra.
 */
export function firstDueDate(dueDay: number, trialDays: number, now = new Date()): Date {
  if (trialDays > 0) {
    return new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);
  }

  const today = brazilDateParts(now);
  const due = billingDate({ year: today.year, month: today.month, day: dueDay });
  // dia já passou neste mês? só então empurra
  if (dueDay < today.day) due.setUTCMonth(due.getUTCMonth() + 1);
  return due;
}

type ResolvedCoupon = {
  code: string;
  type: "PERCENTAGE" | "FIXED";
  /** Percentual (0-100) ou reais, conforme o tipo — é o que o Asaas espera. */
  value: number;
  centsOff: number;
};

async function resolveCoupon(
  code: string | null | undefined,
  plan: Plan,
): Promise<ResolvedCoupon | null> {
  if (!code) return null;

  const db = await getDb();
  const rows = await db
    .select()
    .from(coupons)
    .where(eq(coupons.code, code.trim().toUpperCase()))
    .limit(1);

  const coupon = rows[0];
  if (!coupon || !coupon.active) throw badRequest("Cupom inválido");
  if (coupon.expiresAt && coupon.expiresAt.getTime() < Date.now()) {
    throw badRequest("Cupom expirado");
  }
  if (coupon.maxRedemptions !== null && coupon.redemptions >= coupon.maxRedemptions) {
    throw badRequest("Cupom esgotado");
  }
  if (coupon.planIds?.length && !coupon.planIds.includes(plan.id)) {
    throw badRequest("Cupom não vale para este plano");
  }

  const centsOff =
    coupon.discountType === "PERCENTAGE"
      ? Math.round((plan.priceCents * coupon.discountValue) / 100)
      : coupon.discountValue;

  return {
    code: coupon.code,
    type: coupon.discountType,
    value: coupon.discountType === "PERCENTAGE" ? coupon.discountValue : coupon.discountValue / 100,
    centsOff,
  };
}

async function burnCoupon(code: string) {
  const db = await getDb();
  const rows = await db.select().from(coupons).where(eq(coupons.code, code)).limit(1);
  const coupon = rows[0];
  if (!coupon) return;
  await db
    .update(coupons)
    .set({ redemptions: coupon.redemptions + 1 })
    .where(eq(coupons.code, code));
}
