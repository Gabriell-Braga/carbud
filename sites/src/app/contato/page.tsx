import type { Metadata } from "next";
import { JsonLd, autoDealerJsonLd } from "@carbud/site-kit/jsonld";
import { ContactForm } from "@carbud/site-kit/shared/contact-form";
import { loadSite } from "~/lib/site";
import { absoluteUrl } from "~/lib/urls";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { site } = await loadSite();
  return {
    title: "Contato",
    description: `Endereço, telefone e horários de atendimento da ${site.name}.`,
    alternates: { canonical: "/contato" },
  };
}

export default async function ContactPage() {
  const { slug, site, links, template } = await loadSite();
  const Contact = template.Contact;
  const siteUrl = await absoluteUrl();

  return (
    <>
      <JsonLd data={autoDealerJsonLd(site, siteUrl)} />
      <Contact site={site} links={links} contactForm={<ContactForm tenantSlug={slug} />} />
    </>
  );
}
