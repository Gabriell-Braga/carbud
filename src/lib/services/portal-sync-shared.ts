import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  portalConnections,
  stores,
  tenantSites,
  tenants,
  vehiclePhotos,
  vehiclePublications,
  vehicles,
  type PhotoVariants,
  type PortalConnection,
  type PublicationMeta,
  type Vehicle,
  type VehiclePublication,
} from "@/db/schema";
import type { SellerInfo } from "@/lib/integrations/mercadolivre";
import { ApiError } from "@/lib/http";
import { mediaUrl } from "@/lib/paths";

/**
 * O que todo adaptador de portal precisa e não é de portal nenhum: a fila,
 * o carro, as fotos em URL pública e o contato/endereço da loja.
 */

export type SyncReport = {
  portal: string;
  published: number;
  updated: number;
  removed: number;
  failed: number;
  /** Leads que vieram do portal nesta passada (perguntas viram lead no CRM). */
  leads: number;
  /** Erro que parou a conexão inteira (token, plano), não de um carro só. */
  error?: string;
};

export function emptyReport(portal: string): SyncReport {
  return { portal, published: 0, updated: 0, removed: 0, failed: 0, leads: 0 };
}

/**
 * O que está para fazer neste portal. "erro" entra de novo a cada passada:
 * a pessoa corrige a ficha ou a conta e sincroniza — sem isso, o erro seria
 * definitivo.
 */
export async function publicationQueue(tenantId: string, portal: string) {
  const db = await getDb();
  return db
    .select()
    .from(vehiclePublications)
    .where(
      and(
        eq(vehiclePublications.tenantId, tenantId),
        eq(vehiclePublications.portal, portal),
        inArray(vehiclePublications.status, ["pendente", "removendo", "erro"]),
      ),
    );
}

export async function loadVehicle(vehicleId: string): Promise<Vehicle | null> {
  const db = await getDb();
  const rows = await db.select().from(vehicles).where(eq(vehicles.id, vehicleId)).limit(1);
  return rows[0] ?? null;
}

/** URLs públicas das fotos, capa primeiro. O portal baixa de lá. */
export async function pictureUrls(vehicleId: string, origin: string): Promise<string[]> {
  const db = await getDb();
  const photos = await db
    .select()
    .from(vehiclePhotos)
    .where(eq(vehiclePhotos.vehicleId, vehicleId))
    .orderBy(asc(vehiclePhotos.position));
  return photos
    .sort((a, b) => Number(b.isCover) - Number(a.isCover))
    .map((photo) => mediaUrl((photo.variants as PhotoVariants).full))
    .filter((url): url is string => !!url)
    .map((url) => `${origin}${url}`);
}

/**
 * Contato e endereço do anúncio: a unidade dona do carro, ou o site da
 * revenda quando não há unidade. Nome vem da revenda em qualquer caso.
 */
export async function sellerInfo(vehicle: Vehicle): Promise<SellerInfo> {
  const db = await getDb();
  const tenantRows = await db
    .select({ tenant: tenants, site: tenantSites })
    .from(tenants)
    .leftJoin(tenantSites, eq(tenantSites.tenantId, tenants.id))
    .where(eq(tenants.id, vehicle.tenantId))
    .limit(1);
  const tenant = tenantRows[0]?.tenant;
  const site = tenantRows[0]?.site ?? null;

  const store = vehicle.storeId
    ? ((await db.select().from(stores).where(eq(stores.id, vehicle.storeId)).limit(1))[0] ?? null)
    : null;

  const source = store?.addressCity ? store : site;
  return {
    name: tenant?.name ?? "",
    email: store?.email ?? site?.email ?? null,
    whatsapp: store?.whatsapp ?? site?.whatsapp ?? store?.phone ?? site?.phone ?? null,
    street: source?.addressStreet ?? null,
    number: source?.addressNumber ?? null,
    district: source?.addressDistrict ?? null,
    city: source?.addressCity ?? null,
    state: source?.addressState ?? null,
    zip: source?.addressZip ?? null,
  };
}

/** Grava o resultado de uma publicação; `meta` é mesclado, não substituído. */
export async function savePublication(
  publication: VehiclePublication,
  changes: Partial<
    Pick<VehiclePublication, "status" | "externalId" | "externalUrl" | "lastError">
  > & {
    meta?: PublicationMeta;
  },
): Promise<void> {
  const db = await getDb();
  const { meta, ...rest } = changes;
  await db
    .update(vehiclePublications)
    .set({
      ...rest,
      ...(meta ? { meta: { ...(publication.meta ?? {}), ...meta } } : {}),
      syncedAt: new Date(),
    })
    .where(eq(vehiclePublications.id, publication.id));
}

export async function failPublication(publication: VehiclePublication, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  await savePublication(publication, { status: "erro", lastError: message });
}

/**
 * A conexão inteira parou. Acesso recusado (401) derruba a conexão: só
 * reconectar resolve, e a tela passa a oferecer o botão. Portal fora do ar
 * só fica anotado — a próxima passada tenta de novo sozinha.
 */
export async function failConnection(
  connection: PortalConnection,
  error: unknown,
): Promise<string> {
  const message = error instanceof Error ? error.message : String(error);
  const fatal = error instanceof ApiError && error.status === 401;
  const db = await getDb();
  await db
    .update(portalConnections)
    .set({ ...(fatal ? { status: "erro" as const } : {}), lastError: message })
    .where(eq(portalConnections.id, connection.id));
  return message;
}

export async function finishConnection(
  connection: PortalConnection,
  settings?: Record<string, unknown>,
): Promise<void> {
  const db = await getDb();
  await db
    .update(portalConnections)
    .set({ lastSyncAt: new Date(), lastError: null, ...(settings ? { settings } : {}) })
    .where(eq(portalConnections.id, connection.id));
}

/** Assinatura curta de uma lista; muda qualquer item, muda a assinatura. */
export async function fingerprint(values: string[]): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(values.join("\n")));
  return [...new Uint8Array(digest).slice(0, 8)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
