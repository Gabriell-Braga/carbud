import { jsonOk, notFound, withApi } from "@/lib/http";
import { assertSitesKey } from "@/lib/services/public-api";
import { PUBLIC_VEHICLE_STATUSES } from "@/lib/services/public-site";
import { toVehicleCards } from "@/lib/services/site";
import { listStockFacets, listVehicles } from "@/lib/services/vehicles";
import { getTenantCoreBySlug } from "@/lib/tenant/service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

const STATUSES = [...PUBLIC_VEHICLE_STATUSES];

/**
 * O que a home mostra: destaques, novidades e as facetas dos atalhos.
 *
 * Não dá para montar isso a partir da listagem: ela não conhece "destaque" e
 * fixa doze por página, que é o tamanho certo para o estoque e errado para a
 * vitrine. Deixar o app dos sites juntar as peças faria a regra do que aparece
 * na home existir em dois lugares, e a primeira mudança de curadoria só
 * chegaria a um deles.
 *
 * `latest` já vem sem os destaques, para o mesmo carro não aparecer duas vezes
 * na mesma tela.
 */
export const GET = withApi(async (request: Request, { params }: Params) => {
  assertSitesKey(request);
  const { slug } = await params;

  const tenant = await getTenantCoreBySlug(slug);
  if (!tenant) throw notFound("Revenda não encontrada");

  const [featured, latest, facets] = await Promise.all([
    listVehicles(tenant.id, { statuses: STATUSES, featured: true, pageSize: 8 }),
    listVehicles(tenant.id, { statuses: STATUSES, pageSize: 8, sort: "recentes" }),
    listStockFacets(tenant.id),
  ]);

  return jsonOk(
    {
      featured: await toVehicleCards(featured.items),
      latest: await toVehicleCards(latest.items.filter((vehicle) => !featured.items.some((item) => item.id === vehicle.id))),
      facets,
      totalVehicles: latest.total,
    },
    { headers: { "cache-control": "public, max-age=60, s-maxage=60" } },
  );
});
