import { and, count, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { billingStatus, tenantSites, tenants, vehicles } from "@/db/schema";
import { cached } from "@/lib/cache";
import { mediaUrl } from "@/lib/paths";
import { isPublicSiteAvailable } from "@/lib/tenant/service";
import { PUBLIC_VEHICLE_STATUSES } from "./public-site";

/**
 * Portal Carbud: o estoque de TODAS as revendas no ar, num lugar só.
 *
 * Mora em outro projeto, na Vercel, e — como o app dos sites — nunca fala com
 * o banco: tudo passa pelas rotas de `/api/public/portal`. O que sai daqui é
 * o mesmo conteúdo público que o site de cada revenda já mostra.
 */

export type PortalDealer = {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  state: string | null;
  logoUrl: string | null;
};

/**
 * Revendas que aparecem no portal.
 *
 * A regra é a MESMA do site próprio: suspensa ou inadimplente além da
 * tolerância some dos dois lugares ao mesmo tempo. Uma regra separada aqui
 * faria o carro sumir do site da loja e continuar anunciado no portal.
 *
 * Cache curto no KV: a lista é lida em toda busca do portal, e são poucas
 * linhas que mudam raramente.
 */
export async function listPortalDealers(): Promise<PortalDealer[]> {
  return cached("portal:dealers", 60, async () => {
    const db = await getDb();
    const rows = await db
      .select({
        id: tenants.id,
        slug: tenants.slug,
        name: tenants.name,
        status: tenants.status,
        blockMode: tenants.blockMode,
        billingStatus: billingStatus.status,
        graceDays: billingStatus.graceDays,
        dueDay: billingStatus.dueDay,
        currentDueDate: billingStatus.currentDueDate,
        city: tenantSites.addressCity,
        state: tenantSites.addressState,
        logoKey: tenantSites.logoKey,
      })
      .from(tenants)
      .leftJoin(billingStatus, eq(billingStatus.tenantId, tenants.id))
      .leftJoin(tenantSites, eq(tenantSites.tenantId, tenants.id))
      .where(eq(tenants.status, "active"));

    return rows
      .filter((row) =>
        isPublicSiteAvailable({
          status: row.status,
          blockMode: row.blockMode,
          billing: row.billingStatus
            ? {
                status: row.billingStatus,
                dueDay: row.dueDay ?? 10,
                graceDays: row.graceDays ?? 5,
                currentDueDate: row.currentDueDate ? row.currentDueDate.getTime() : null,
              }
            : null,
        }),
      )
      .map((row) => ({
        id: row.id,
        slug: row.slug,
        name: row.name,
        city: row.city,
        state: row.state,
        logoUrl: mediaUrl(row.logoKey),
      }));
  });
}

/** Anúncios publicados por revenda, para a página de lojas do portal. */
export async function countPublishedByDealer(ids: string[]): Promise<Map<string, number>> {
  if (!ids.length) return new Map();
  const db = await getDb();
  const rows = await db
    .select({ tenantId: vehicles.tenantId, total: count() })
    .from(vehicles)
    .where(and(inArray(vehicles.tenantId, ids), inArray(vehicles.status, [...PUBLIC_VEHICLE_STATUSES])))
    .groupBy(vehicles.tenantId);
  return new Map(rows.map((row) => [row.tenantId, row.total]));
}

/** Normaliza para comparar cidade digitada com a cadastrada ("São Paulo" = "sao paulo"). */
export function sameText(a: string, b: string): boolean {
  const norm = (value: string) =>
    value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  return norm(a) === norm(b);
}

/**
 * Destaques da busca do portal: poucos e em rodízio, sem vantagem para
 * ninguém. Cada volta passa uma vez por cada revenda com destaque (ordem
 * fixa pelo id), e dentro da revenda os carros dela se revezam; então loja
 * com 10 destaques aparece tanto quanto loja com 1. `slot` avança com o
 * relógio (um por minuto, o mesmo tempo do cache da busca).
 */
export function pickHighlights<T extends { id: string; tenantId: string }>(items: T[], slot: number, size = 3): T[] {
  const byDealer = new Map<string, T[]>();
  for (const item of [...items].sort((a, b) => a.id.localeCompare(b.id))) {
    byDealer.set(item.tenantId, [...(byDealer.get(item.tenantId) ?? []), item]);
  }
  const dealers = [...byDealer.keys()].sort();
  if (!dealers.length) return [];

  const picked = new Map<string, T>();
  // passa por no máximo um ciclo inteiro de posições; com poucos carros, para quando acabam
  for (let position = slot * size; picked.size < Math.min(size, items.length) && position < slot * size + size * items.length; position++) {
    const cars = byDealer.get(dealers[position % dealers.length])!;
    const car = cars[Math.floor(position / dealers.length) % cars.length];
    picked.set(car.id, car);
  }
  return [...picked.values()];
}
