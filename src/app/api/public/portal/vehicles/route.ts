import { asc, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { vehiclePhotos, type PhotoVariants } from "@/db/schema";
import { jsonOk, withApi } from "@/lib/http";
import { mediaUrl } from "@/lib/paths";
import { assertSitesKey } from "@/lib/services/public-api";
import { parsePublicFilters, PUBLIC_VEHICLE_STATUSES } from "@/lib/services/public-site";
import { listPortalDealers, sameText } from "@/lib/services/portal";
import { toVehicleCard } from "@/lib/services/site";
import {
  isBelowFipe,
  isInspected,
  listMedia360,
  listStockFacets,
  listVehicles,
} from "@/lib/services/vehicles";

export const dynamic = "force-dynamic";

const CARD_PHOTOS = 6;

/**
 * Busca do Portal Carbud: estoque publicado de todas as revendas no ar.
 *
 * Os filtros de veículo são os mesmos do site da revenda (`parsePublicFilters`).
 * `abaixoFipe=1`, `vistoriado=1` e `visao360=1` só existem aqui: FIPE salva no
 * cadastro, laudo válido (`isInspected`) e giro ou panorâmica anexados.
 * Os do portal — `loja`, `cidade`, `uf` — recortam a lista de REVENDAS antes da
 * consulta, então a busca continua sendo uma consulta só ao D1.
 *
 * Cada carro volta com a revenda dona dele: é o que o card mostra e de onde o
 * portal tira o endereço da ficha (`/api/public/site/<loja>/vehicles/<slug>`).
 */
export const GET = withApi(async (request: Request) => {
  assertSitesKey(request);

  const query = Object.fromEntries(new URL(request.url).searchParams.entries());
  const { filters, applied } = parsePublicFilters(query);
  const belowFipe = query.abaixoFipe === "1";
  const inspected = query.vistoriado === "1";
  const has360 = query.visao360 === "1";

  const all = await listPortalDealers();
  const dealers = all.filter(
    (dealer) =>
      (!query.loja || dealer.slug === query.loja) &&
      (!query.cidade || (dealer.city && sameText(dealer.city, query.cidade))) &&
      (!query.uf || (dealer.state && sameText(dealer.state, query.uf))),
  );
  const ids = dealers.map((dealer) => dealer.id);
  const byId = new Map(dealers.map((dealer) => [dealer.id, dealer]));

  const [result, facets] = await Promise.all([
    listVehicles(ids, { ...filters, belowFipe, inspected, has360, statuses: [...PUBLIC_VEHICLE_STATUSES] }),
    listStockFacets(ids),
  ]);

  // fotos da página numa consulta só: o card do portal desliza entre elas
  const photosByVehicle = new Map<string, { id: string; thumb: string; card: string; full: string }[]>();
  if (result.items.length > 0) {
    const db = await getDb();
    const rows = await db
      .select({ id: vehiclePhotos.id, vehicleId: vehiclePhotos.vehicleId, variants: vehiclePhotos.variants })
      .from(vehiclePhotos)
      .where(inArray(vehiclePhotos.vehicleId, result.items.map((item) => item.id)))
      .orderBy(asc(vehiclePhotos.position));
    for (const row of rows) {
      const list = photosByVehicle.get(row.vehicleId) ?? [];
      // o card não precisa da galeria inteira; a ficha mostra o resto
      if (list.length >= CARD_PHOTOS) continue;
      const variants = row.variants as PhotoVariants;
      list.push({
        id: row.id,
        thumb: mediaUrl(variants.thumb) ?? "",
        card: mediaUrl(variants.card) ?? "",
        full: mediaUrl(variants.full) ?? "",
      });
      photosByVehicle.set(row.vehicleId, list);
    }
  }

  const media360 = await listMedia360(result.items.map((item) => item.id));

  // cidades de todas as revendas no ar, para o filtro de localização
  const cities = Array.from(
    new Set(all.filter((d) => d.city).map((d) => `${d.city}${d.state ? ` - ${d.state}` : ""}`)),
  ).sort((a, b) => a.localeCompare(b));

  return jsonOk(
    {
      vehicles: result.items.map((item) => {
        const dealer = byId.get(item.tenantId)!;
        return {
          ...toVehicleCard(item),
          photos: photosByVehicle.get(item.id) ?? [],
          belowFipe: isBelowFipe(item),
          inspected: isInspected(item),
          has360: media360.has(item.id),
          dealer: { slug: dealer.slug, name: dealer.name, city: dealer.city, state: dealer.state },
        };
      }),
      facets: { ...facets, cities },
      filters: { ...applied, loja: query.loja, cidade: query.cidade, uf: query.uf, abaixoFipe: belowFipe || undefined, vistoriado: inspected || undefined, visao360: has360 || undefined },
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    },
    { headers: { "cache-control": "public, max-age=60, s-maxage=60" } },
  );
});
