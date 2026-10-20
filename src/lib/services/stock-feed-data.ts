import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { plateEnd } from "@/lib/format/plate";
import { getDb } from "@/db";
import {
  stores,
  tenantSites,
  vehiclePhotos,
  vehicles,
  type PhotoVariants,
  type VehicleStatus,
} from "@/db/schema";
import { mediaUrl } from "@/lib/paths";
import type { FeedStore, FeedVehicle } from "@/lib/integrations/stock-feed";

/**
 * Só o que já está publicado no site.
 *
 * Rascunho é ficha pela metade e vendido não está à venda — mandar qualquer um
 * dos dois faria o portal publicar anúncio errado, e o prejuízo de reputação
 * cai na revenda, não em nós.
 */
const FEED_STATUSES: VehicleStatus[] = ["available", "reserved"];

const MAX_VEHICLES = 1000;

export async function loadFeedData(
  tenantId: string,
  tenantName: string,
  slug: string,
  origin: string,
): Promise<{
  store: FeedStore;
  vehicles: FeedVehicle[];
  /** Só o catálogo da Meta usa: página do Facebook e se há política de privacidade. */
  meta: { pageId: string | null; hasPrivacy: boolean };
}> {
  const db = await getDb();

  const siteRows = await db
    .select()
    .from(tenantSites)
    .where(eq(tenantSites.tenantId, tenantId))
    .limit(1);
  const site = siteRows[0];

  // com multiunidade, o contato da unidade padrão é mais preciso que o do site
  const defaultStore = await db
    .select()
    .from(stores)
    .where(and(eq(stores.tenantId, tenantId), eq(stores.isDefault, true)))
    .limit(1);
  const unit = defaultStore[0];

  const rows = await db
    .select()
    .from(vehicles)
    .where(and(eq(vehicles.tenantId, tenantId), inArray(vehicles.status, FEED_STATUSES)))
    .orderBy(desc(vehicles.updatedAt))
    .limit(MAX_VEHICLES);

  const photosByVehicle = new Map<string, string[]>();
  if (rows.length > 0) {
    const photoRows = await db
      .select({
        vehicleId: vehiclePhotos.vehicleId,
        variants: vehiclePhotos.variants,
        position: vehiclePhotos.position,
      })
      .from(vehiclePhotos)
      .where(
        inArray(
          vehiclePhotos.vehicleId,
          rows.map((row) => row.id),
        ),
      )
      .orderBy(asc(vehiclePhotos.position));

    for (const photo of photoRows) {
      // portal baixa a imagem de fora: precisa de URL absoluta, e da maior
      // variante — a miniatura ficaria borrada no anúncio deles
      const key = (photo.variants as PhotoVariants).full;
      const url = mediaUrl(key);
      if (!url) continue;
      const list = photosByVehicle.get(photo.vehicleId) ?? [];
      list.push(`${origin}${url}`);
      photosByVehicle.set(photo.vehicleId, list);
    }
  }

  const street = unit?.addressStreet ?? site?.addressStreet ?? null;
  const number = unit?.addressNumber ?? site?.addressNumber ?? null;

  return {
    meta: {
      pageId: site?.tracking?.metaPageId ?? null,
      hasPrivacy: Boolean(site?.legalPrivacy),
    },
    store: {
      name: tenantName,
      slug,
      phone: unit?.phone ?? site?.phone ?? null,
      whatsapp: unit?.whatsapp ?? site?.whatsapp ?? null,
      email: unit?.email ?? site?.email ?? null,
      city: unit?.addressCity ?? site?.addressCity ?? null,
      state: unit?.addressState ?? site?.addressState ?? null,
      street: street ? [street, number].filter(Boolean).join(", ") : null,
      zip: unit?.addressZip ?? site?.addressZip ?? null,
    },
    vehicles: rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      brand: row.brand,
      model: row.model,
      version: row.version,
      yearManufacture: row.yearManufacture,
      yearModel: row.yearModel,
      mileageKm: row.mileageKm,
      priceCents: row.priceCents,
      priceOnRequest: row.priceOnRequest,
      transmission: row.transmission,
      fuel: row.fuel,
      bodyType: row.bodyType,
      color: row.color,
      doors: row.doors,
      // o feed dos portais sempre exportou o final, e mudar isso quebraria o
      // contrato com quem ja consome
      licensePlateEnd: plateEnd(row.licensePlate) ?? row.licensePlateEnd,
      options: row.options ?? [],
      description: row.description,
      status: row.status,
      fipeCode: row.fipeCode,
      photos: photosByVehicle.get(row.id) ?? [],
      updatedAt: row.updatedAt,
    })),
  };
}
