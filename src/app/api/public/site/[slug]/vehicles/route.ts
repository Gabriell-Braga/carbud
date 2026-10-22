import { jsonOk, notFound, withApi } from "@/lib/http";
import { assertSitesKey } from "@/lib/services/public-api";
import { parsePublicFilters, PUBLIC_VEHICLE_STATUSES } from "@/lib/services/public-site";
import { toVehicleCards } from "@/lib/services/site";
import { listStockFacets, listVehicles } from "@/lib/services/vehicles";
import { getTenantCoreBySlug } from "@/lib/tenant/service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

/**
 * Estoque publicado, com os mesmos filtros da query string do site.
 *
 * Reaproveita `parsePublicFilters` para que a tradução de "?marca=fiat" para
 * filtro interno aconteça em UM lugar só. Duplicá-la no app dos sites faria os
 * dois divergirem no primeiro filtro novo.
 */
export const GET = withApi(async (request: Request, { params }: Params) => {
  assertSitesKey(request);
  const { slug } = await params;

  const tenant = await getTenantCoreBySlug(slug);
  if (!tenant) throw notFound("Revenda não encontrada");

  const query = Object.fromEntries(new URL(request.url).searchParams.entries());
  const { filters, applied } = parsePublicFilters(query);

  const [result, facets] = await Promise.all([
    listVehicles(tenant.id, { ...filters, statuses: [...PUBLIC_VEHICLE_STATUSES] }),
    listStockFacets(tenant.id),
  ]);

  return jsonOk(
    {
      vehicles: await toVehicleCards(result.items),
      facets,
      filters: applied,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    },
    { headers: { "cache-control": "public, max-age=60, s-maxage=60" } },
  );
});
