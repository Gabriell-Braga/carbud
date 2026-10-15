import Link from "next/link";
import type { SiteData, SiteLinks } from "../contract";
import { headlineHours, summarizeHours } from "../shared/hours";
import { ShowroomHeader } from "./menu";
import { WhatsappIcon } from "../shared/whatsapp-icon";

/**
 * Gradiente do herói.
 *
 * O desenho vai de um azul-acinzentado médio até o branco. Em vez de cravar os
 * hex do Figma, ele é derivado do tema: a revenda que trocar a cor da marca
 * continua com o mesmo desenho, que é a promessa do white-label.
 *
 * `--site-hero` é a mistura de marca e texto que dá a base; os passos vão
 * clareando até o fundo da página.
 */
export const HERO_GRADIENT =
  "bg-[linear-gradient(180deg,color-mix(in_srgb,var(--site-hero)_92%,white)_0%,color-mix(in_srgb,var(--site-hero)_62%,white)_26%,color-mix(in_srgb,var(--site-hero)_28%,white)_62%,color-mix(in_srgb,var(--site-hero)_6%,white)_88%,var(--site-surface)_100%)]";

export const HERO_VARS = {
  "--site-hero": "color-mix(in srgb, var(--site-primary) 42%, var(--site-text) 58%)",
} as React.CSSProperties;

/** Largura útil do desenho: 1280 com respiro de 24. */
export const SHELL = "mx-auto w-full max-w-[1280px] px-6";

/**
 * Moldura do Showroom.
 *
 * `overlay` é só da home, a única página com banner atrás do cabeçalho. Nas
 * outras a barra já nasce sólida e o conteúdo começa abaixo dela — sem isso o
 * primeiro título ficaria escondido atrás de uma barra fixa.
 */
export function Shell({
  site,
  links,
  overlay = false,
  children,
}: {
  site: SiteData;
  links: SiteLinks;
  overlay?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[var(--site-surface)] text-[var(--site-text)]">
      {/* a moldura roda no servidor e monta os enderecos: o cabecalho e
          componente de cliente e nao pode receber funcao */}
      <ShowroomHeader
        storeName={site.name}
        logoUrl={site.logoUrl}
        phone={site.contact.phone}
        homeHref={links.home}
        whatsappHref={links.whatsapp(`Olá! Vim pelo site da ${site.name}.`)}
        todayHours={headlineHours(site.contact.businessHours)}
        nav={[
          { label: "Início", href: links.home },
          { label: "Estoque", href: links.stock },
          { label: "Financiamento", href: links.financing },
          { label: "Venda seu carro", href: links.sellCar },
          { label: "Sobre nós", href: links.about },
          { label: "Contato", href: links.contact },
        ]}
        categories={[
          { label: "Todos os veículos", href: links.stock },
          { label: "SUVs", href: links.stockWith({ carroceria: "suv" }) },
          { label: "Hatches", href: links.stockWith({ carroceria: "hatch" }) },
          { label: "Sedãs", href: links.stockWith({ carroceria: "sedan" }) },
          { label: "Picapes", href: links.stockWith({ carroceria: "picape" }) },
          { label: "Ofertas", href: links.stockWith({ ordem: "preco-asc" }) },
        ]}
        overlay={overlay}
      />
      <main className={overlay ? "" : "pt-16"}>{children}</main>
      <Footer site={site} links={links} />
    </div>
  );
}

/** Título de seção do desenho: nome grande, uma linha de apoio abaixo. */
export function SectionHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h2
          className="text-[26px] leading-tight"
          style={{ fontFamily: "var(--site-font-heading)" }}
        >
          {title}
        </h2>
        {description ? (
          <p className="mt-1.5 text-[13px] text-[var(--site-muted)]">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

/**
 * Faixa de células separadas por régua vertical.
 *
 * O desenho usa este padrão duas vezes — categorias na home e diferenciais —
 * e ele é o oposto do card: sem sombra, sem fundo, só uma linha entre um
 * assunto e o próximo.
 */
export function RuledRow({
  items,
  columns = 6,
}: {
  items: { title: string; text?: string; href?: string }[];
  columns?: 4 | 6;
}) {
  const grade = columns === 4 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3 lg:grid-cols-6";

  return (
    <div className={`grid grid-cols-1 border-t border-[var(--site-border)] ${grade}`}>
      {items.map((item) => {
        const conteudo = (
          <>
            <p className="text-sm font-medium">{item.title}</p>
            {item.text ? (
              <p className="mt-1 text-[12px] leading-relaxed text-[var(--site-muted)]">
                {item.text}
              </p>
            ) : null}
          </>
        );

        return item.href ? (
          <Link
            key={item.title}
            href={item.href}
            className="border-b border-l border-[var(--site-border)] px-5 py-4 transition-colors first:border-l-0 hover:bg-[var(--site-background)] sm:border-b-0"
          >
            {conteudo}
          </Link>
        ) : (
          <div
            key={item.title}
            className="border-b border-l border-[var(--site-border)] px-5 py-4 first:border-l-0 sm:border-b-0"
          >
            {conteudo}
          </div>
        );
      })}
    </div>
  );
}

/** Faixa escura de conversa, como no desenho: texto à esquerda, botão à direita. */
export function TalkBand({
  site,
  links,
  title,
  description,
}: {
  site: SiteData;
  links: SiteLinks;
  title: string;
  description: string;
}) {
  const whatsapp = links.whatsapp(`Olá! Vim pelo site da ${site.name}.`);

  return (
    <section className="bg-[var(--site-text)] py-12 text-white">
      <div className={`${SHELL} flex flex-wrap items-center justify-between gap-6`}>
        <div>
          <p className="text-[22px] leading-tight" style={{ fontFamily: "var(--site-font-heading)" }}>
            {title}
          </p>
          <p className="mt-1.5 text-[13px] text-white/60">{description}</p>
        </div>
        {whatsapp ? (
          <a
            href={whatsapp}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-[var(--site-radius)] bg-[var(--site-whatsapp)] px-5 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            <WhatsappIcon />
            Falar no WhatsApp
          </a>
        ) : null}
      </div>
    </section>
  );
}

function Footer({ site, links }: { site: SiteData; links: SiteLinks }) {
  const hours = summarizeHours(site.contact.businessHours);

  const colunas = [
    {
      title: "Estoque",
      items: [
        { label: "Todos os veículos", href: links.stock },
        { label: "SUVs", href: links.stockWith({ carroceria: "suv" }) },
        { label: "Hatches", href: links.stockWith({ carroceria: "hatch" }) },
        { label: "Sedãs", href: links.stockWith({ carroceria: "sedan" }) },
        { label: "Picapes", href: links.stockWith({ carroceria: "picape" }) },
        { label: "Ofertas", href: links.stockWith({ ordem: "preco-asc" }) },
      ],
    },
    {
      title: "Institucional",
      items: [
        { label: "Sobre nós", href: links.about },
        { label: "Financiamento", href: links.financing },
        { label: "Venda seu carro", href: links.sellCar },
        { label: "Avaliações", href: `${links.about}#avaliacoes` },
        { label: "Contato", href: links.contact },
      ],
    },
  ];

  return (
    <footer className="bg-[var(--site-text)] text-white">
      <div className={`${SHELL} grid grid-cols-1 gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4`}>
        <div>
          <p
            className="text-sm font-semibold uppercase tracking-[0.18em]"
            style={{ fontFamily: "var(--site-font-heading)" }}
          >
            {site.name}
          </p>
          <p className="mt-3 max-w-[26ch] text-[13px] leading-relaxed text-white/60">
            Seu próximo carro com atendimento direto.
          </p>
          {site.contact.address.full ? (
            <p className="mt-3 text-[13px] text-white/60">{site.contact.address.full}</p>
          ) : null}
          {site.contact.phone ? (
            <p className="mt-3 text-[13px] text-white/60">{site.contact.phone}</p>
          ) : null}
          {site.contact.email ? (
            <p className="text-[13px] text-white/60">{site.contact.email}</p>
          ) : null}
        </div>

        {colunas.map((coluna) => (
          <div key={coluna.title}>
            <p className="text-[13px] font-semibold">{coluna.title}</p>
            <ul className="mt-3 space-y-2">
              {coluna.items.map((item) => (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    className="text-[13px] text-white/60 transition-colors hover:text-white"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div>
          <p className="text-[13px] font-semibold">Atendimento</p>
          <ul className="mt-3 space-y-2 text-[13px] text-white/60">
            {site.contact.whatsapp ? <li>WhatsApp</li> : null}
            {hours.map((line) => (
              <li key={line.label}>
                {line.label}: {line.value}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className={`${SHELL} flex flex-wrap items-center justify-between gap-3 py-5`}>
          <p className="text-[12px] text-white/40">
            © {new Date().getFullYear()} {site.name}. Todos os direitos reservados.
          </p>
          <div className="flex flex-wrap gap-5 text-[12px] text-white/40">
            {site.legal.privacy ? (
              <Link href={links.privacy} className="transition-colors hover:text-white">
                Política de Privacidade
              </Link>
            ) : null}
            {site.legal.terms ? (
              <Link href={links.terms} className="transition-colors hover:text-white">
                Termos de Uso
              </Link>
            ) : null}
            {site.contact.social.instagram ? (
              <a
                href={site.contact.social.instagram}
                target="_blank"
                rel="noreferrer"
                className="transition-colors hover:text-white"
              >
                Instagram
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </footer>
  );
}
