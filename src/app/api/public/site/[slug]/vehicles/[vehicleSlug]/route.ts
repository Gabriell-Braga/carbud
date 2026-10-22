import { jsonOk, notFound, withApi } from "@/lib/http";
import { assertSitesKey } from "@/lib/services/public-api";
import { PUBLIC_VEHICLE_STATUSES } from "@/lib/services/public-site";
import { toVehicleCard, toVehicleDetail } from "@/lib/services/site";
import { getVehicleBySlug, listMedia360, listVehicles } from "@/lib/services/vehicles";
import { getTenantCoreBySlug } from "@/lib/tenant/service";
import type { VehicleStatus } from "@/db/schema";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string; vehicleSlug: string }> };

const PUBLICOS: VehicleStatus[] = [...PUBLIC_VEHICLE_STATUSES];

/** Ficha completa de um veículo, com os semelhantes que a página mostra no pé. */
export const GET = withApi(async (request: Request, { params }: Params) => {
  assertSitesKey(request);
  const { slug, vehicleSlug } = await params;

  const tenant = await getTenantCoreBySlug(slug);
  if (!tenant) throw notFound("Revenda não encontrada");

  const found = await getVehicleBySlug(tenant.id, vehicleSlug);
  /*
   * Rascunho e vendido respondem 404 aqui.
   *
   * O anúncio saiu do ar, e devolver a ficha faria o site mostrar um carro que
   * a loja não vende mais — com preço, o que é pior que não mostrar nada.
   */
  if (!found || !PUBLICOS.includes(found.vehicle.status)) {
    throw notFound("Veículo não encontrado");
  }

  // semelhantes = mesma marca; é a aproximação que a loja usa ao sugerir
  const [related, media360] = await Promise.all([
    listVehicles(tenant.id, {
      statuses: [...PUBLIC_VEHICLE_STATUSES],
      brand: found.vehicle.brand,
      pageSize: 5,
    }),
    listMedia360([found.vehicle.id]),
  ]);

  return jsonOk(
    {
      vehicle: toVehicleDetail(found.vehicle, found.photos, media360.get(found.vehicle.id)),
      related: related.items
        .filter((item) => item.id !== found.vehicle.id)
        .slice(0, 4)
        .map(toVehicleCard),
    },
    { headers: { "cache-control": "public, max-age=60, s-maxage=60" } },
  );
});
