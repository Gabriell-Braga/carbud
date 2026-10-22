import { loadPublicSite, PUBLIC_VEHICLE_STATUSES } from "@/lib/services/public-site";
import { FinancingEstimator } from "@carbud/site-kit/shared/financing-form";
import { financingOptions } from "@/lib/services/financing-options";
import { JsonLd, autoDealerJsonLd } from "@/lib/seo/jsonld";
import { tenantAbsoluteUrl } from "@/lib/seo/urls";
import { toVehicleCards } from "@/lib/services/site";
import { listStockFacets, listVehicles } from "@/lib/services/vehicles";

export const dynamic = "force-dynamic";

export default async function TenantHomePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const context = await loadPublicSite(slug);
  const statuses = [...PUBLIC_VEHICLE_STATUSES];

  const [featured, latest, facets, siteUrl, financingVehicles] = await Promise.all([
    listVehicles(context.tenantId, { statuses, featured: true, pageSize: 8 }),
    listVehicles(context.tenantId, { statuses, pageSize: 8, sort: "recentes" }),
    listStockFacets(context.tenantId),
    tenantAbsoluteUrl(slug),
    financingOptions(context.tenantId),
  ]);

  const Home = context.template.Home;

  return (
    <>
      <JsonLd data={autoDealerJsonLd(context.site, siteUrl)} />
      <Home
        site={context.site}
        links={context.links}
        featured={await toVehicleCards(featured.items)}
        latest={await toVehicleCards(latest.items.filter((vehicle) => !featured.items.some((item) => item.id === vehicle.id)))}
        facets={facets}
        totalVehicles={latest.total}
        /*
         * Simulação curta da home: veículo, entrada e prazo.
         *
         * `continueHref` faz o botão levar para a página de financiamento com
         * as escolhas na URL, em vez de enviar daqui. Pedir nome e telefone na
         * home cobraria o dado antes de a pessoa ter visto uma conta.
         */
        financingForm={
          financingVehicles.length > 0 ? (
            <FinancingEstimator
              vehicles={financingVehicles}
              defaults={context.site.financing}
              continueHref={context.links.financing}
            />
          ) : null
        }
      />
    </>
  );
}
