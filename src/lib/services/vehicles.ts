import { and, asc, count, desc, eq, gte, inArray, like, lte, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  vehicleMedia360,
  vehiclePhotos,
  vehicles,
  type Fuel,
  type InspectionResult,
  type PhotoVariants,
  type Transmission,
  type Vehicle,
  type VehicleStatus,
} from "@/db/schema";
import { deleteObjects, photoKeys } from "@/lib/storage/r2";
import { slugify } from "@/lib/utils";
import type { VehicleFilters } from "@/lib/validation/vehicles";

export type VehicleListItem = {
  id: string;
  tenantId: string;
  slug: string;
  brand: string;
  model: string;
  version: string | null;
  yearManufacture: number;
  yearModel: number;
  mileageKm: number;
  priceCents: number;
  priceOnRequest: boolean;
  status: VehicleStatus;
  featured: boolean;
  /*
   * Cambio e combustivel entram na LISTA, nao so na ficha.
   *
   * O card do site mostra "2024 . 32.480 km . Automatico" — sao os tres
   * numeros que a pessoa usa para descartar um carro sem abrir. Sem eles na
   * consulta, o card ficava com dois tercos da linha e o template nao tinha
   * como saber que faltava dado: o campo chegava nulo, que e indistinguivel
   * de "esta revenda nao preencheu".
   */
  transmission: Transmission | null;
  fuel: Fuel | null;
  /**
   * A placa completa, para a LISTA do painel.
   *
   * É o que separa dois carros iguais no pátio — mesmo modelo, mesmo ano,
   * mesma cor. Não sai daqui para o site público: lá a ficha mostra só o
   * final.
   */
  licensePlate: string | null;
  fipePriceCents: number | null;
  inspectionDate: string | null;
  inspectionResult: InspectionResult | null;
  inspectionReportKey: string | null;
  coverPhotoKey: string | null;
  photosCount: number;
  createdAt: Date;
};

const LIST_COLUMNS = {
  id: vehicles.id,
  tenantId: vehicles.tenantId,
  slug: vehicles.slug,
  brand: vehicles.brand,
  model: vehicles.model,
  version: vehicles.version,
  yearManufacture: vehicles.yearManufacture,
  yearModel: vehicles.yearModel,
  mileageKm: vehicles.mileageKm,
  priceCents: vehicles.priceCents,
  priceOnRequest: vehicles.priceOnRequest,
  status: vehicles.status,
  featured: vehicles.featured,
  transmission: vehicles.transmission,
  fuel: vehicles.fuel,
  // a lista mostra a placa: e como a loja distingue dois carros iguais
  licensePlate: vehicles.licensePlate,
  fipePriceCents: vehicles.fipePriceCents,
  inspectionDate: vehicles.inspectionDate,
  inspectionResult: vehicles.inspectionResult,
  inspectionReportKey: vehicles.inspectionReportKey,
  coverPhotoKey: vehicles.coverPhotoKey,
  photosCount: vehicles.photosCount,
  createdAt: vehicles.createdAt,
};

/**
 * TODA consulta de veículo passa por aqui com tenantId obrigatório —
 * é o que garante o isolamento entre revendas.
 */
export type VehicleQuery = Partial<VehicleFilters> & {
  statuses?: VehicleStatus[];
  belowFipe?: boolean;
  inspected?: boolean;
  has360?: boolean;
  /** Destaque na frente na ordem padrão. O portal desliga: lá destaque é rodízio de 3 (`pickHighlights`). */
  featuredFirst?: boolean;
};

/**
 * Uma revenda (painel, site) ou uma lista delas (portal, que junta o estoque
 * de todas as revendas no ar). Lista vazia não traz nada — nunca "todas".
 */
type TenantScope = string | string[];

function tenantCondition(scope: TenantScope) {
  return typeof scope === "string"
    ? eq(vehicles.tenantId, scope)
    : inArray(vehicles.tenantId, scope.length ? scope : [""]);
}

function buildConditions(scope: TenantScope, filters: VehicleQuery) {
  const conditions = [tenantCondition(scope)];

  if (filters.status) conditions.push(eq(vehicles.status, filters.status));
  if (filters.statuses?.length) conditions.push(inArray(vehicles.status, filters.statuses));
  if (filters.brand) conditions.push(eq(vehicles.brand, filters.brand));
  if (filters.model) conditions.push(eq(vehicles.model, filters.model));
  if (filters.transmission) conditions.push(eq(vehicles.transmission, filters.transmission));
  if (filters.fuel) conditions.push(eq(vehicles.fuel, filters.fuel));
  if (filters.bodyType) conditions.push(eq(vehicles.bodyType, filters.bodyType));
  if (filters.featured !== undefined) conditions.push(eq(vehicles.featured, filters.featured));
  if (filters.priceMin !== undefined) conditions.push(gte(vehicles.priceCents, filters.priceMin));
  if (filters.priceMax !== undefined) conditions.push(lte(vehicles.priceCents, filters.priceMax));
  if (filters.yearMin !== undefined) conditions.push(gte(vehicles.yearModel, filters.yearMin));
  if (filters.yearMax !== undefined) conditions.push(lte(vehicles.yearModel, filters.yearMax));
  if (filters.kmMax !== undefined) conditions.push(lte(vehicles.mileageKm, filters.kmMax));
  // mesma regra de isBelowFipe, em SQL; carro sem FIPE consultada fica de fora
  if (filters.belowFipe) {
    conditions.push(
      sql`${vehicles.priceOnRequest} = 0 and ${vehicles.priceCents} > 0 and ${vehicles.fipePriceCents} > 0 and ${vehicles.priceCents} < ${vehicles.fipePriceCents}`,
    );
  }
  // mesma regra de isInspected
  if (filters.inspected) {
    conditions.push(
      sql`${vehicles.inspectionReportKey} is not null and ${vehicles.inspectionResult} in ('approved', 'approved_with_notes') and ${vehicles.inspectionDate} >= ${inspectionCutoff()}`,
    );
  }
  if (filters.has360) {
    conditions.push(
      sql`exists (select 1 from ${vehicleMedia360} where ${vehicleMedia360.vehicleId} = ${vehicles.id})`,
    );
  }

  if (filters.search) {
    const term = `%${filters.search.toLowerCase()}%`;
    conditions.push(
      or(
        like(sql`lower(${vehicles.brand})`, term),
        like(sql`lower(${vehicles.model})`, term),
        like(sql`lower(${vehicles.version})`, term),
      )!,
    );
  }

  return and(...conditions);
}

function buildOrder(sort: VehicleFilters["sort"], featuredFirst = true) {
  switch (sort) {
    case "preco-asc":
      return [asc(vehicles.priceCents)];
    case "preco-desc":
      return [desc(vehicles.priceCents)];
    case "km-asc":
      return [asc(vehicles.mileageKm)];
    case "ano-desc":
      return [desc(vehicles.yearModel)];
    default:
      return featuredFirst ? [desc(vehicles.featured), desc(vehicles.createdAt)] : [desc(vehicles.createdAt)];
  }
}

/**
 * Preço anunciado abaixo da FIPE guardada no cadastro.
 *
 * Calculado na leitura, e não gravado como coluna: preço e FIPE já ficam
 * salvos no veículo, e um booleano à parte desatualizaria na primeira
 * mudança de preço feita por outro caminho (importação, API, edição rápida).
 */
export function isBelowFipe(vehicle: {
  priceCents: number;
  priceOnRequest: boolean;
  fipePriceCents: number | null;
}): boolean {
  return (
    !vehicle.priceOnRequest &&
    vehicle.priceCents > 0 &&
    !!vehicle.fipePriceCents &&
    vehicle.priceCents < vehicle.fipePriceCents
  );
}

/** Laudo mais velho que isto não vale: o carro rodou mais um ano desde a vistoria. */
const INSPECTION_VALID_DAYS = 365;

export function inspectionCutoff(now = new Date()): string {
  return new Date(now.getTime() - INSPECTION_VALID_DAYS * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Selo "Vistoriado": laudo anexado, aprovado (com ou sem ressalvas) e com
 * menos de um ano. Laudo reprovado fica guardado para a loja, sem selo.
 */
export function isInspected(
  vehicle: {
    inspectionReportKey: string | null;
    inspectionResult: InspectionResult | null;
    inspectionDate: string | null;
  },
  now = new Date(),
): boolean {
  return (
    !!vehicle.inspectionReportKey &&
    (vehicle.inspectionResult === "approved" || vehicle.inspectionResult === "approved_with_notes") &&
    !!vehicle.inspectionDate &&
    vehicle.inspectionDate >= inspectionCutoff(now)
  );
}

export type Media360 = { spin: string[]; pano: string | null };

/** Giro e panorâmica de cada veículo pedido, em chaves do R2. */
export async function listMedia360(vehicleIds: string[]): Promise<Map<string, Media360>> {
  const result = new Map<string, Media360>();
  if (vehicleIds.length === 0) return result;
  const db = await getDb();
  const rows = await db
    .select({ vehicleId: vehicleMedia360.vehicleId, kind: vehicleMedia360.kind, keys: vehicleMedia360.keys })
    .from(vehicleMedia360)
    .where(inArray(vehicleMedia360.vehicleId, vehicleIds));
  for (const row of rows) {
    const entry = result.get(row.vehicleId) ?? { spin: [], pano: null };
    if (row.kind === "spin") entry.spin = row.keys;
    else entry.pano = row.keys[0] ?? null;
    result.set(row.vehicleId, entry);
  }
  return result;
}

export async function listVehicles(scope: TenantScope, filters: VehicleQuery = {}) {
  const db = await getDb();
  const pageSize = filters.pageSize ?? 12;
  const page = filters.page ?? 1;
  const where = buildConditions(scope, filters);

  const [items, totalRows] = await Promise.all([
    db
      .select(LIST_COLUMNS)
      .from(vehicles)
      .where(where)
      .orderBy(...buildOrder(filters.sort ?? "recentes", filters.featuredFirst))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ value: count() }).from(vehicles).where(where),
  ]);

  return {
    items: items as VehicleListItem[],
    total: totalRows[0]?.value ?? 0,
    page,
    pageSize,
  };
}

export async function getVehicle(tenantId: string, id: string) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(vehicles)
    .where(and(eq(vehicles.tenantId, tenantId), eq(vehicles.id, id)))
    .limit(1);

  const vehicle = rows[0];
  if (!vehicle) return null;

  const photos = await db
    .select()
    .from(vehiclePhotos)
    .where(eq(vehiclePhotos.vehicleId, id))
    .orderBy(asc(vehiclePhotos.position));

  return { vehicle, photos };
}

export async function getVehicleBySlug(tenantId: string, slug: string) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(vehicles)
    .where(and(eq(vehicles.tenantId, tenantId), eq(vehicles.slug, slug)))
    .limit(1);

  const vehicle = rows[0];
  if (!vehicle) return null;

  const photos = await db
    .select()
    .from(vehiclePhotos)
    .where(eq(vehiclePhotos.vehicleId, vehicle.id))
    .orderBy(asc(vehiclePhotos.position));

  return { vehicle, photos };
}

/** Slug legível e único dentro da revenda. */
export async function buildVehicleSlug(
  tenantId: string,
  parts: { brand: string; model: string; version?: string | null; yearModel: number },
  exceptVehicleId?: string,
): Promise<string> {
  const db = await getDb();
  const base =
    slugify(`${parts.brand} ${parts.model} ${parts.version ?? ""} ${parts.yearModel}`) || "veiculo";

  let candidate = base;
  for (let attempt = 1; attempt <= 50; attempt++) {
    const existing = await db
      .select({ id: vehicles.id })
      .from(vehicles)
      .where(and(eq(vehicles.tenantId, tenantId), eq(vehicles.slug, candidate)))
      .limit(1);

    if (!existing[0] || existing[0].id === exceptVehicleId) return candidate;
    candidate = `${base}-${attempt + 1}`;
  }

  return `${base}-${Date.now()}`;
}

export async function deleteVehicle(tenantId: string, id: string): Promise<Vehicle | null> {
  const db = await getDb();
  const found = await db
    .select()
    .from(vehicles)
    .where(and(eq(vehicles.tenantId, tenantId), eq(vehicles.id, id)))
    .limit(1);

  const vehicle = found[0];
  if (!vehicle) return null;

  const photos = await db
    .select({ variants: vehiclePhotos.variants })
    .from(vehiclePhotos)
    .where(eq(vehiclePhotos.vehicleId, id));

  const media360 = await db
    .select({ keys: vehicleMedia360.keys })
    .from(vehicleMedia360)
    .where(eq(vehicleMedia360.vehicleId, id));

  await db.delete(vehiclePhotos).where(eq(vehiclePhotos.vehicleId, id));
  await db.delete(vehicles).where(and(eq(vehicles.tenantId, tenantId), eq(vehicles.id, id)));

  const keys = [
    ...photos.flatMap((photo) => photoKeys(photo.variants as PhotoVariants)),
    ...media360.flatMap((row) => row.keys),
    ...(vehicle.inspectionReportKey ? [vehicle.inspectionReportKey] : []),
  ];
  await deleteObjects(keys);

  return vehicle;
}

/**
 * Recalcula capa, contagem e ORDEM depois de qualquer mudança nas fotos.
 *
 * Duas invariantes, e as duas nasceram de defeito visto no site publicado:
 *
 * 1. As posições são densas: 0, 1, 2, ... sem buraco. Apagar uma foto do meio
 *    deixava um vão, e o envio seguinte calculava a posição pela CONTAGEM —
 *    então reusava um número já ocupado. Duas fotos com a mesma posição saem
 *    na ordem que o banco escolher, e ela muda entre uma consulta e outra.
 *
 * 2. A foto da posição 0 é a capa. O painel já promete isso na tela ("A
 *    primeira foto é a capa"), mas quem definia a capa só marcava a foto sem
 *    movê-la: o card do estoque mostrava a terceira foto e a galeria da ficha
 *    abria na primeira. Duas imagens diferentes para o mesmo carro.
 *
 * Deriva `isCover` da posição, e não o contrário. Quem quer trocar a capa mexe
 * na ordem — é o que `setCoverPhoto` faz.
 */
export async function syncVehiclePhotoState(tenantId: string, vehicleId: string): Promise<void> {
  const db = await getDb();
  const photos = await db
    .select({
      id: vehiclePhotos.id,
      variants: vehiclePhotos.variants,
      isCover: vehiclePhotos.isCover,
      position: vehiclePhotos.position,
    })
    .from(vehiclePhotos)
    .where(eq(vehiclePhotos.vehicleId, vehicleId))
    // desempate por criação: sem ele, duas fotos empatadas trocam de lugar sozinhas
    .orderBy(asc(vehiclePhotos.position), asc(vehiclePhotos.createdAt));

  for (const [indice, photo] of photos.entries()) {
    const capa = indice === 0;
    // só escreve o que mudou: o caso comum é nada mudar
    if (photo.position === indice && photo.isCover === capa) continue;
    await db
      .update(vehiclePhotos)
      .set({ position: indice, isCover: capa })
      .where(eq(vehiclePhotos.id, photo.id));
  }

  const cover = photos[0];

  await db
    .update(vehicles)
    .set({
      photosCount: photos.length,
      coverPhotoKey: cover ? (cover.variants as PhotoVariants).card : null,
    })
    .where(and(eq(vehicles.tenantId, tenantId), eq(vehicles.id, vehicleId)));
}

export async function reorderPhotos(
  tenantId: string,
  vehicleId: string,
  photoIds: string[],
): Promise<boolean> {
  const db = await getDb();
  const owned = await db
    .select({ id: vehiclePhotos.id })
    .from(vehiclePhotos)
    .where(and(eq(vehiclePhotos.tenantId, tenantId), eq(vehiclePhotos.vehicleId, vehicleId)));

  const ownedIds = new Set(owned.map((photo) => photo.id));
  if (photoIds.some((id) => !ownedIds.has(id))) return false;

  for (const [index, photoId] of photoIds.entries()) {
    await db.update(vehiclePhotos).set({ position: index }).where(eq(vehiclePhotos.id, photoId));
  }

  await syncVehiclePhotoState(tenantId, vehicleId);
  return true;
}

/**
 * Define a capa MOVENDO a foto para a frente.
 *
 * Antes isto só acendia uma marca, e a foto continuava no meio da fila: o card
 * do estoque mostrava uma imagem e a galeria da ficha abria em outra. Capa é
 * primeira foto, nos dois lugares e no feed dos portais.
 */
export async function setCoverPhoto(
  tenantId: string,
  vehicleId: string,
  photoId: string,
): Promise<boolean> {
  const db = await getDb();
  const photos = await db
    .select({ id: vehiclePhotos.id })
    .from(vehiclePhotos)
    .where(and(eq(vehiclePhotos.tenantId, tenantId), eq(vehiclePhotos.vehicleId, vehicleId)))
    .orderBy(asc(vehiclePhotos.position), asc(vehiclePhotos.createdAt));

  if (!photos.some((photo) => photo.id === photoId)) return false;

  const ordem = [photoId, ...photos.map((photo) => photo.id).filter((id) => id !== photoId)];
  for (const [indice, id] of ordem.entries()) {
    await db.update(vehiclePhotos).set({ position: indice }).where(eq(vehiclePhotos.id, id));
  }

  await syncVehiclePhotoState(tenantId, vehicleId);
  return true;
}

export async function deletePhoto(
  tenantId: string,
  vehicleId: string,
  photoId: string,
): Promise<boolean> {
  const db = await getDb();
  const found = await db
    .select()
    .from(vehiclePhotos)
    .where(
      and(
        eq(vehiclePhotos.tenantId, tenantId),
        eq(vehiclePhotos.vehicleId, vehicleId),
        eq(vehiclePhotos.id, photoId),
      ),
    )
    .limit(1);

  const photo = found[0];
  if (!photo) return false;

  await db.delete(vehiclePhotos).where(eq(vehiclePhotos.id, photoId));
  await deleteObjects(photoKeys(photo.variants as PhotoVariants));
  await syncVehiclePhotoState(tenantId, vehicleId);
  return true;
}

export type TenantVehicleStats = {
  total: number;
  available: number;
  reserved: number;
  sold: number;
  draft: number;
  featured: number;
};

export async function getVehicleStats(tenantId: string): Promise<TenantVehicleStats> {
  const db = await getDb();
  const rows = await db
    .select({ status: vehicles.status, value: count() })
    .from(vehicles)
    .where(eq(vehicles.tenantId, tenantId))
    .groupBy(vehicles.status);

  const featuredRows = await db
    .select({ value: count() })
    .from(vehicles)
    .where(and(eq(vehicles.tenantId, tenantId), eq(vehicles.featured, true)));

  const byStatus = Object.fromEntries(rows.map((row) => [row.status, row.value]));

  return {
    total: rows.reduce((sum, row) => sum + row.value, 0),
    available: byStatus.available ?? 0,
    reserved: byStatus.reserved ?? 0,
    sold: byStatus.sold ?? 0,
    draft: byStatus.draft ?? 0,
    featured: featuredRows[0]?.value ?? 0,
  };
}

/** Marcas/modelos realmente presentes no estoque — alimenta os filtros do site. */
export async function listStockFacets(scope: TenantScope, onlyPublished = true) {
  const db = await getDb();
  const conditions = [tenantCondition(scope)];
  if (onlyPublished) {
    conditions.push(inArray(vehicles.status, ["available", "reserved"] as VehicleStatus[]));
  }

  const rows = await db
    .select({
      brand: vehicles.brand,
      model: vehicles.model,
      transmission: vehicles.transmission,
      fuel: vehicles.fuel,
      bodyType: vehicles.bodyType,
      priceCents: vehicles.priceCents,
      yearModel: vehicles.yearModel,
    })
    .from(vehicles)
    .where(and(...conditions));

  const brands = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!brands.has(row.brand)) brands.set(row.brand, new Set());
    brands.get(row.brand)!.add(row.model);
  }

  /*
   * Contagem por categoria.
   *
   * Sai das MESMAS linhas ja carregadas, entao nao custa consulta nenhuma. O
   * Template 03 mostra "84 veiculos" ao lado de cada atalho, e um numero
   * inventado ali leva a pessoa a uma lista vazia — a pior primeira impressao
   * possivel num site de loja.
   */
  const contar = <T extends string>(valores: (T | null)[]) => {
    const mapa: Record<string, number> = {};
    for (const valor of valores) {
      if (!valor) continue;
      mapa[valor] = (mapa[valor] ?? 0) + 1;
    }
    return mapa;
  };

  const PRECO_FAIXAS = [50000, 80000, 120000, 180000];
  const priceUpTo: Record<string, number> = {};
  for (const faixa of PRECO_FAIXAS) {
    priceUpTo[String(faixa)] = rows.filter((row) => row.priceCents <= faixa * 100).length;
  }

  return {
    counts: {
      bodyTypes: contar(rows.map((row) => row.bodyType)),
      transmissions: contar(rows.map((row) => row.transmission)),
      fuels: contar(rows.map((row) => row.fuel)),
      priceUpTo,
    },
    brands: Array.from(brands.entries())
      .map(([brand, models]) => ({ brand, models: Array.from(models).sort() }))
      .sort((a, b) => a.brand.localeCompare(b.brand)),
    transmissions: Array.from(new Set(rows.map((row) => row.transmission).filter(Boolean))),
    fuels: Array.from(new Set(rows.map((row) => row.fuel).filter(Boolean))),
    bodyTypes: Array.from(new Set(rows.map((row) => row.bodyType).filter(Boolean))),
    priceRange: rows.length
      ? {
          min: Math.min(...rows.map((row) => row.priceCents)),
          max: Math.max(...rows.map((row) => row.priceCents)),
        }
      : { min: 0, max: 0 },
    yearRange: rows.length
      ? {
          min: Math.min(...rows.map((row) => row.yearModel)),
          max: Math.max(...rows.map((row) => row.yearModel)),
        }
      : { min: 0, max: 0 },
  };
}
