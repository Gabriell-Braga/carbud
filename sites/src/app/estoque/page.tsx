import type { Metadata } from "next";
import { fetchVehicles } from "~/lib/panel";
import { loadSite } from "~/lib/site";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata(): Promise<Metadata> {
  const { site } = await loadSite();
  return {
    title: "Estoque",
    description: `Veículos seminovos disponíveis na ${site.name}.`,
    // filtro e paginação na query viram a mesma página para o buscador
    alternates: { canonical: "/estoque" },
  };
}

export default async function StockPage({ searchParams }: Props) {
  const { slug, site, links, template } = await loadSite();
  const query = await searchParams;
  const estoque = await fetchVehicles(slug, query);

  const Listing = template.Listing;

  return (
    <Listing
      site={site}
      links={links}
      vehicles={estoque.vehicles}
      facets={estoque.facets}
      filters={estoque.filters}
      total={estoque.total}
      page={estoque.page}
      pageSize={estoque.pageSize}
    />
  );
}
