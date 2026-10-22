import { jsonOk, withApi } from "@/lib/http";
import { assertSitesKey } from "@/lib/services/public-api";
import { countPublishedByDealer, listPortalDealers } from "@/lib/services/portal";

export const dynamic = "force-dynamic";

/** Revendas no ar, com quantos anúncios cada uma tem publicados. Loja sem carro fica de fora. */
export const GET = withApi(async (request: Request) => {
  assertSitesKey(request);

  const dealers = await listPortalDealers();
  const totals = await countPublishedByDealer(dealers.map((dealer) => dealer.id));

  return jsonOk(
    {
      dealers: dealers
        .map(({ id, ...dealer }) => ({ ...dealer, vehicles: totals.get(id) ?? 0 }))
        .filter((dealer) => dealer.vehicles > 0)
        .sort((a, b) => a.name.localeCompare(b.name)),
    },
    { headers: { "cache-control": "public, max-age=60, s-maxage=60" } },
  );
});
