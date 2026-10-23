import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { plans, subscriptions } from "@/db/schema";

export type PlanOption = {
  id: string;
  name: string;
  priceCents: number;
  billingMode: string;
  trialDays: number;
};

/** Planos que podem ser contratados agora — inativo não aparece na escolha. */
export async function listActivePlanOptions(): Promise<PlanOption[]> {
  const db = await getDb();
  const rows = await db
    .select({
      id: plans.id,
      name: plans.name,
      priceCents: plans.priceCents,
      billingMode: plans.billingMode,
      trialDays: plans.trialDays,
    })
    .from(plans)
    .where(eq(plans.active, true))
    .orderBy(asc(plans.sortOrder), asc(plans.name));
  return rows;
}

export async function getTenantSubscription(tenantId: string) {
  const db = await getDb();
  const rows = await db
    .select({ subscription: subscriptions, plan: plans })
    .from(subscriptions)
    .leftJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(subscriptions.tenantId, tenantId))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return {
    planName: row.plan?.name ?? null,
    summary: {
      status: row.subscription.status,
      billingType: row.subscription.billingType,
      priceCents: row.subscription.priceCents,
      couponCode: row.subscription.couponCode,
      trialEndsAt: row.subscription.trialEndsAt?.toISOString() ?? null,
      currentPeriodEnd: row.subscription.currentPeriodEnd?.toISOString() ?? null,
      gatewaySubscriptionId: row.subscription.gatewaySubscriptionId,
      gatewayEnvironment: row.subscription.gatewayEnvironment ?? "production",
      lastEventType: row.subscription.lastEventType,
      lastEventAt: row.subscription.lastEventAt?.toISOString() ?? null,
    },
  };
}
