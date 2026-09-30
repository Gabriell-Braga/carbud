import { and, asc, count, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import {
  plans,
  platformSettings,
  tenantBanners,
  tenants,
  users,
  vehicles,
  type PlatformSettings,
  type Plan,
  type VehicleStatus,
} from "@/db/schema";
import { cached, invalidate } from "@/lib/cache";
import { buildEntitlements, checkLimit, type Entitlements } from "./entitlements";
import type { LimitKey } from "./catalog";

const PLAN_TTL = 120;

const cacheKeys = {
  tenantPlan: (tenantId: string) => `plan:tenant:${tenantId}`,
  settings: () => "platform:settings",
  activePlans: () => "plans:active",
};

/* ------------------------------------------------------------------------ */
/* Configurações da plataforma                                               */
/* ------------------------------------------------------------------------ */

export const DEFAULT_SETTINGS = {
  finePercent: 2,
  interestPercent: 1,
  defaultTrialDays: 0,
  gatewayNotifications: true,
  defaultGraceDays: 5,
};

export async function getPlatformSettings(): Promise<
  Omit<PlatformSettings, "id" | "updatedAt" | "emailTemplates">
> {
  return cached(cacheKeys.settings(), PLAN_TTL, async () => {
    const db = await getDb();
    const rows = await db.select().from(platformSettings).limit(1);
    const row = rows[0];
    if (!row) return DEFAULT_SETTINGS;

    return {
      finePercent: row.finePercent,
      interestPercent: row.interestPercent,
      defaultTrialDays: row.defaultTrialDays,
      gatewayNotifications: row.gatewayNotifications,
      defaultGraceDays: row.defaultGraceDays,
    };
  });
}

export async function invalidateSettings(): Promise<void> {
  await invalidate(cacheKeys.settings());
}

/* ------------------------------------------------------------------------ */
/* Planos                                                                    */
/* ------------------------------------------------------------------------ */

export async function listPlans(onlyActive = false): Promise<Plan[]> {
  const db = await getDb();
  const query = db.select().from(plans).orderBy(asc(plans.sortOrder), asc(plans.name));
  if (!onlyActive) return query;
  return db
    .select()
    .from(plans)
    .where(eq(plans.active, true))
    .orderBy(asc(plans.sortOrder), asc(plans.name));
}

export async function getPlan(id: string): Promise<Plan | null> {
  const db = await getDb();
  const rows = await db.select().from(plans).where(eq(plans.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function invalidatePlanCaches(tenantIds: string[] = []): Promise<void> {
  await invalidate(
    cacheKeys.activePlans(),
    ...tenantIds.map((tenantId) => cacheKeys.tenantPlan(tenantId)),
  );
}

/* ------------------------------------------------------------------------ */
/* Direitos por revenda                                                      */
/* ------------------------------------------------------------------------ */

/** Cacheado no KV: é lido em toda escrita do painel da revenda. */
export async function getEntitlements(tenantId: string): Promise<Entitlements> {
  const snapshot = await cached(cacheKeys.tenantPlan(tenantId), PLAN_TTL, async () => {
    const db = await getDb();
    const rows = await db
      .select({
        id: plans.id,
        name: plans.name,
        limits: plans.limits,
        features: plans.features,
      })
      .from(tenants)
      .innerJoin(plans, eq(plans.id, tenants.planId))
      .where(eq(tenants.id, tenantId))
      .limit(1);

    return rows[0] ?? null;
  });

  return buildEntitlements(snapshot);
}

export async function invalidateEntitlements(tenantId: string): Promise<void> {
  await invalidate(cacheKeys.tenantPlan(tenantId));
}

/* ------------------------------------------------------------------------ */
/* Uso atual                                                                 */
/* ------------------------------------------------------------------------ */

/** Só o que ocupa vaga: rascunho e vendido não contam como veículo ativo. */
const ACTIVE_VEHICLE_STATUSES: VehicleStatus[] = ["available", "reserved"];

export async function countActiveVehicles(tenantId: string): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select({ value: count() })
    .from(vehicles)
    .where(
      and(eq(vehicles.tenantId, tenantId), inArray(vehicles.status, ACTIVE_VEHICLE_STATUSES)),
    );
  return rows[0]?.value ?? 0;
}

export async function countActiveUsers(tenantId: string): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select({ value: count() })
    .from(users)
    .where(and(eq(users.tenantId, tenantId), eq(users.status, "active")));
  return rows[0]?.value ?? 0;
}

export async function countBanners(tenantId: string): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select({ value: count() })
    .from(tenantBanners)
    .where(eq(tenantBanners.tenantId, tenantId));
  return rows[0]?.value ?? 0;
}

const COUNTERS: Partial<Record<LimitKey, (tenantId: string) => Promise<number>>> = {
  maxVehicles: countActiveVehicles,
  maxUsers: countActiveUsers,
  maxBanners: countBanners,
};

/**
 * Checa um limite contando o uso atual.
 * Devolve o resultado em vez de lançar, para quem chama decidir o erro.
 */
export async function checkTenantLimit(tenantId: string, key: LimitKey) {
  const entitlements = await getEntitlements(tenantId);
  const counter = COUNTERS[key];
  const current = counter ? await counter(tenantId) : 0;
  return checkLimit(entitlements, key, current);
}

/** Resumo de consumo para mostrar no painel. */
export async function getUsageSummary(tenantId: string) {
  const [entitlements, vehiclesUsed, usersUsed] = await Promise.all([
    getEntitlements(tenantId),
    countActiveVehicles(tenantId),
    countActiveUsers(tenantId),
  ]);

  return {
    entitlements,
    usage: { vehicles: vehiclesUsed, users: usersUsed },
  };
}

/** Revendas sem plano — usado pelo painel para cobrar a definição. */
export async function countTenantsWithoutPlan(): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select({ value: count() })
    .from(tenants)
    .where(and(isNull(tenants.planId), eq(tenants.status, "active")));
  return rows[0]?.value ?? 0;
}
