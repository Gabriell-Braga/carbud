import type { Metadata } from "next";
import { FinancingEstimator } from "@carbud/site-kit/shared/financing-form";
import { JsonLd, autoDealerJsonLd } from "@carbud/site-kit/jsonld";
import { fetchFinancingOptions, fetchHome } from "~/lib/panel";
import { loadSite } from "~/lib/site";
import { absoluteUrl } from "~/lib/urls";

export const dynamic = "force-dynamic";

// sem isto, `/?utm_source=...` vira outra página para o buscador
export const metadata: Metadata = { alternates: { canonical: "/" } };

export default async function HomePage() {
  const { slug, site, links, template } = await loadSite();

  const [vitrine, financiamento, siteUrl] = await Promise.all([
    fetchHome(slug),
    fetchFinancingOptions(slug),
    absoluteUrl(),
  ]);

  const Home = template.Home;

  return (
    <>
      <JsonLd data={autoDealerJsonLd(site, siteUrl)} />
      <Home
        site={site}
        links={links}
        featured={vitrine.featured}
        latest={vitrine.latest}
        facets={vitrine.facets}
        totalVehicles={vitrine.totalVehicles}
        /*
         * Simulacao curta da home: veiculo, entrada e prazo. O botao leva para
         * a pagina de financiamento com as escolhas na URL — pedir nome e
         * telefone aqui cobraria o dado antes de a pessoa ter visto uma conta.
         */
        financingForm={
          financiamento.length > 0 ? (
            <FinancingEstimator
              vehicles={financiamento}
              defaults={site.financing}
              continueHref={links.financing}
            />
          ) : null
        }
      />
    </>
  );
}
