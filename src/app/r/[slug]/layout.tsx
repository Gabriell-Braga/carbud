import { notFound } from "next/navigation";
import { Archivo, Barlow_Condensed, DM_Sans, Manrope } from "next/font/google";
import type { Metadata } from "next";
import { getSiteData } from "@/lib/services/site";
import { applySitePreview, readSitePreview } from "@/lib/services/site-preview";
import { getTenantCoreBySlug, isPublicSiteAvailable } from "@/lib/tenant/service";
import { getOrigin, tenantAbsoluteUrl } from "@/lib/seo/urls";
import { themeToCssVariables } from "@carbud/site-kit/contract";
import { GoogleTagManager } from "@carbud/site-kit/shared/gtm";
import { TrackingScripts } from "@carbud/site-kit/shared/tracking";
import { WhatsappGate } from "@carbud/site-kit/shared/whatsapp-gate";
import { findTemplateManifest } from "@carbud/site-kit/manifests";
import { PreviewBar } from "./preview-bar";

export const dynamic = "force-dynamic";

type Props = {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const site = await getSiteData(slug);
  if (!site) return { title: "Site indisponível" };

  const [url, origin] = await Promise.all([tenantAbsoluteUrl(slug), getOrigin()]);
  const description =
    site.aboutText?.slice(0, 160) ??
    `Confira o estoque de seminovos da ${site.name}: fotos, ficha técnica e contato direto.`;

  return {
    // sem isso o Next resolve URLs relativas (og:image) contra localhost
    metadataBase: new URL(origin),
    title: { default: site.name, template: `%s · ${site.name}` },
    // o icone da aba e o da revenda, nao o do painel
    icons: site.faviconUrl ? { icon: site.faviconUrl } : undefined,
    description,
    alternates: { canonical: url },
    openGraph: {
      siteName: site.name,
      title: site.name,
      description,
      url,
      type: "website",
      locale: "pt_BR",
    },
    twitter: { card: "summary_large_image" },
  };
}

/**
 * Fontes dos templates desenhados no Figma.
 *
 * `preload: false` de propósito: o site de uma revenda usa UMA delas, e
 * pré-carregar todas gastaria banda de visitante em arquivo que a página não
 * vai referenciar. Sem preload o navegador baixa só a que o CSS pedir.
 *
 * A variável entra sempre; quem decide se ela é usada é o tema do template,
 * que aponta `fontHeading` para ela.
 */
const dmSans = DM_Sans({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-dm-sans",
});

/*
 * Uma fonte por template desenhado: DM Sans no Vitrine, Manrope no Showroom,
 * Archivo com Barlow Condensed no Marketplace.
 *
 * Todas com `preload: false`, pelo mesmo motivo da primeira: um site usa UMA
 * delas, e pre-carregar as quatro gastaria banda do visitante em arquivo que a
 * pagina nao referencia. Quem escolhe e o tema do template, via CSS.
 */
const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-manrope",
});

const archivo = Archivo({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-archivo",
});

const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
  preload: false,
  variable: "--font-barlow-condensed",
});

const FONTES = [dmSans, manrope, archivo, barlowCondensed]
  .map((fonte) => fonte.variable)
  .join(" ");

export default async function PublicSiteLayout({ children, params }: Props) {
  const { slug } = await params;

  const tenant = await getTenantCoreBySlug(slug);
  if (!tenant) notFound();

  const preview = await readSitePreview(slug);
  const saved = await getSiteData(slug);
  const site = saved ? applySitePreview(saved, preview) : null;
  const cssVariables = site ? themeToCssVariables(site.theme) : {};
  const available = isPublicSiteAvailable(tenant);

  return (
    <div className={FONTES} style={cssVariables as React.CSSProperties}>
      {preview ? (
        <PreviewBar templateName={findTemplateManifest(preview.templateId)?.name ?? ""} />
      ) : null}
      {/*
        GTM só carrega em site no ar — página de indisponibilidade não dispara
        tag. Prévia também não: a visita é da própria loja e sujaria o pixel.
      */}
      {available && !preview ? (
        <>
          <GoogleTagManager containerId={site?.gtmCode ?? null} />
          <TrackingScripts ids={site?.tracking ?? {}} />
          <WhatsappGate
            tenantSlug={slug}
            enabled={site?.contact.whatsappForm ?? false}
            fields={site?.contact.whatsappFormFields}
          />
        </>
      ) : null}
      {children}
    </div>
  );
}
