import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { SellCarForm } from "@carbud/site-kit/shared/sell-car-form";
import { loadSite } from "~/lib/site";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ carro?: string; ano?: string; km?: string }>;
};

export async function generateMetadata(): Promise<Metadata> {
  const { site } = await loadSite();
  return {
    title: "Venda seu carro",
    description: `Envie os dados do seu veículo e receba uma avaliação da ${site.name}.`,
    alternates: { canonical: "/venda-seu-carro" },
  };
}

export default async function SellCarPage({ searchParams }: Props) {
  const { carro, ano, km } = await searchParams;
  const { slug, site, links, template } = await loadSite();

  const SellCar = template.SellCar;
  if (!SellCar) notFound();

  return (
    <SellCar
      site={site}
      links={links}
      /* o que a pessoa digitou no card de troca da ficha chega preenchido */
      sellForm={
        <SellCarForm tenantSlug={slug} initial={{ brandModel: carro, years: ano, mileageKm: km }} />
      }
    />
  );
}
