import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { JsonLd, autoDealerJsonLd } from "@carbud/site-kit/jsonld";
import { fetchHome } from "~/lib/panel";
import { loadSite } from "~/lib/site";
import { absoluteUrl } from "~/lib/urls";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { site } = await loadSite();
  return {
    title: "Sobre nós",
    description:
      site.aboutText?.slice(0, 160) ??
      `Conheça a ${site.name}: estoque, atendimento e estrutura.`,
    alternates: { canonical: "/sobre" },
  };
}

export default async function AboutPage() {
  const { slug, site, links, template } = await loadSite();

  const About = template.About;
  if (!About) notFound();

  const [vitrine, siteUrl] = await Promise.all([fetchHome(slug), absoluteUrl()]);

  return (
    <>
      <JsonLd data={autoDealerJsonLd(site, siteUrl)} />
      <About site={site} links={links} totalVehicles={vitrine.totalVehicles} />
    </>
  );
}
