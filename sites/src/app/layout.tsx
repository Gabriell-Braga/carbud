import type { Metadata } from "next";
import { Archivo, Barlow_Condensed, DM_Sans, Manrope } from "next/font/google";
import { themeToCssVariables } from "@carbud/site-kit/contract";
import { GoogleTagManager } from "@carbud/site-kit/shared/gtm";
import { TrackingScripts } from "@carbud/site-kit/shared/tracking";
import { WhatsappGate } from "@carbud/site-kit/shared/whatsapp-gate";
import { fetchSite } from "~/lib/panel";
import { currentSlug } from "~/lib/site";
import { absoluteUrl } from "~/lib/urls";
import "./globals.css";

export const dynamic = "force-dynamic";

/**
 * O titulo e a descricao sao da REVENDA, nunca da plataforma.
 *
 * Quem chega neste dominio esta no site de uma loja de carros; qualquer
 * mencao a "Carbud" aqui apareceria na aba do navegador e no resultado
 * do Google do cliente.
 */
export async function generateMetadata(): Promise<Metadata> {
  const slug = await currentSlug();
  const { site } = await fetchSite(slug);

  const description =
    site.aboutText?.slice(0, 160) ??
    `Confira o estoque de seminovos da ${site.name}: fotos, ficha técnica e contato direto.`;

  return {
    // canonical e og:image relativos resolvem contra o domínio da revenda
    metadataBase: new URL(await absoluteUrl()),
    title: { default: site.name, template: `%s · ${site.name}` },
    /*
     * O icone da aba e o da REVENDA.
     *
     * Sem isto o navegador cai no /favicon.ico do dominio, que nao existe — e
     * a aba fica com o icone generico de pagina, que num site de loja passa a
     * impressao de coisa improvisada.
     */
    icons: site.faviconUrl ? { icon: site.faviconUrl } : undefined,
    description,
    openGraph: {
      siteName: site.name,
      title: site.name,
      description,
      type: "website",
      locale: "pt_BR",
    },
    twitter: { card: "summary_large_image" },
  };
}

/*
 * `preload: false`: o site de uma revenda usa UMA fonte, e pre-carregar todas
 * gastaria banda do visitante em arquivo que a pagina nao referencia.
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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const slug = await currentSlug();
  const { site, gtmCode, tracking, available } = await fetchSite(slug);

  return (
    <html lang="pt-BR" className={FONTES}>
      <body style={themeToCssVariables(site.theme) as React.CSSProperties}>
        {/* GTM so carrega em site no ar — pagina de indisponibilidade nao dispara tag */}
        {available ? (
          <>
            <GoogleTagManager containerId={gtmCode} />
            <TrackingScripts ids={tracking ?? {}} />
            <WhatsappGate
              tenantSlug={slug}
              enabled={site.contact.whatsappForm ?? false}
              fields={site.contact.whatsappFormFields}
            />
          </>
        ) : null}
        {children}
      </body>
    </html>
  );
}
