import { jsonOk, withApi } from "@/lib/http";
import { assertSitesKey } from "@/lib/services/public-api";
import { parsePublicFilters, PUBLIC_VEHICLE_STATUSES } from "@/lib/services/public-site";
import { listPortalDealers, pickHighlights, sameText } from "@/lib/services/portal";
import { listCardPhotos, toVehicleCard } from "@/lib/services/site";
import {
  isBelowFipe,
  isInspected,
  listMedia360,
  listStockFacets,
  listVehicles,
} from "@/lib/services/vehicles";

export const dynamic = "force-dynamic";

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

  const scope = { ...filters, belowFipe, inspected, has360, statuses: [...PUBLIC_VEHICLE_STATUSES] };
  const [result, featured, facets] = await Promise.all([
    listVehicles(ids, { ...scope, featuredFirst: false }),
    // ponytail: rodízio entre os 200 destaques mais recentes; passando disso, sortear no SQL
    listVehicles(ids, { ...scope, featured: true, page: 1, pageSize: 200 }),
    listStockFacets(ids),
  ]);
  const highlights = pickHighlights(featured.items, Math.floor(Date.now() / 60_000));
  const shown = [...result.items, ...highlights];

  const photosByVehicle = await listCardPhotos(shown.map((item) => item.id));

  const media360 = await listMedia360(shown.map((item) => item.id));
  const card = (item: (typeof shown)[number]) => {
    const dealer = byId.get(item.tenantId)!;
    return {
      ...toVehicleCard(item),
      photos: photosByVehicle.get(item.id) ?? [],
      belowFipe: isBelowFipe(item),
      inspected: isInspected(item),
      has360: media360.has(item.id),
      dealer: { slug: dealer.slug, name: dealer.name, city: dealer.city, state: dealer.state },
    };
  };

  // cidades de todas as revendas no ar, para o filtro de localização
  const cities = Array.from(
    new Set(all.filter((d) => d.city).map((d) => `${d.city}${d.state ? ` - ${d.state}` : ""}`)),
  ).sort((a, b) => a.localeCompare(b));

  return jsonOk(
    {
      vehicles: result.items.map(card),
      // até 3 destaques em rodízio (`pickHighlights`); a lista principal não dá vantagem a destaque
      highlights: highlights.map(card),
      facets: { ...facets, cities },
      filters: { ...applied, loja: query.loja, cidade: query.cidade, uf: query.uf, abaixoFipe: belowFipe || undefined, vistoriado: inspected || undefined, visao360: has360 || undefined },
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    },
    { headers: { "cache-control": "public, max-age=60, s-maxage=60" } },
  );
});
