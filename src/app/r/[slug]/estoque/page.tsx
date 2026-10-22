import type { Metadata } from "next";
import { loadPublicSite, parsePublicFilters, PUBLIC_VEHICLE_STATUSES } from "@/lib/services/public-site";
import { toVehicleCards } from "@/lib/services/site";
import { listStockFacets, listVehicles } from "@/lib/services/vehicles";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const context = await loadPublicSite(slug);
  return {
    title: "Estoque",
    description: `Veículos seminovos disponíveis na ${context.site.name}.`,
  };
}

export default async function TenantStockPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const rawParams = await searchParams;

  const context = await loadPublicSite(slug);
  const { filters, applied } = parsePublicFilters(rawParams);

  const [result, facets] = await Promise.all([
    listVehicles(context.tenantId, { ...filters, statuses: [...PUBLIC_VEHICLE_STATUSES] }),
    listStockFacets(context.tenantId),
  ]);

  const Listing = context.template.Listing;

  return (
    <Listing
      site={context.site}
      links={context.links}
      vehicles={await toVehicleCards(result.items)}
      facets={facets}
      filters={applied}
      total={result.total}
      page={result.page}
      pageSize={result.pageSize}
    />
  );
}
