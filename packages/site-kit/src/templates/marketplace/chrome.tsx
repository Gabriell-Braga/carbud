import Form from "next/form";
import Link from "next/link";
import { MapPin, Search } from "lucide-react";
import type { SiteData, SiteLinks } from "../contract";
import { summarizeHours } from "../shared/hours";
import { WhatsappIcon } from "../shared/whatsapp-icon";

export const SHELL = "mx-auto w-full max-w-[1200px] px-6";

/**
 * Moldura do Marketplace.
 *
 * O topo é o oposto do Showroom: a busca fica no cabeçalho, visível em toda
 * página, e a navegação inteira aparece na barra. É o formato de quem compara
 * muito antes de decidir — a pessoa volta a buscar sem precisar ir a lugar
 * nenhum.
 */
export function Shell({
  site,
  links,
  children,
}: {
  site: SiteData;
  links: SiteLinks;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[var(--site-surface)] text-[var(--site-text)]">
      <Header site={site} links={links} />
      <main>{children}</main>
      <Footer site={site} links={links} />
    </div>
  );
}

function Header({ site, links }: { site: SiteData; links: SiteLinks }) {
  const cidade = [site.contact.address.city, site.contact.address.state]
    .filter(Boolean)
    .join(" / ");

  return (
    <header className="border-b border-[var(--site-border)] bg-[var(--site-surface)]">
      <div className={`${SHELL} flex h-16 items-center gap-6`}>
        <Link
          href={links.home}
          className="shrink-0 text-[15px] font-bold uppercase tracking-[0.06em] text-[var(--site-primary)]"
          style={{ fontFamily: "var(--site-font-heading)" }}
        >
          {site.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={site.logoUrl} alt={site.name} className="h-8 w-auto object-contain" />
          ) : (
            site.name
          )}
        </Link>

        {/* a busca mora no cabeçalho: é a ação central deste desenho */}
        <Form action={links.stock} className="relative hidden flex-1 md:block">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--site-muted)]"
            aria-hidden="true"
          />
          <input
            name="q"
            placeholder="Pesquise por marca, modelo ou versão"
            aria-label="Buscar veículos"
            className="h-10 w-full rounded-[var(--site-radius)] border border-[var(--site-border)] bg-[var(--site-background)] pl-10 pr-3 text-[13px] outline-none transition-colors focus:border-[var(--site-primary)]"
          />
        </Form>

        <nav className="ml-auto hidden items-center gap-5 text-[13px] lg:flex">
          {cidade ? (
            <span className="inline-flex items-center gap-1 text-[var(--site-muted)]">
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
              {cidade}
            </span>
          ) : null}
          <Link href={links.stock} className="transition-colors hover:text-[var(--site-primary)]">
            Comprar
          </Link>
          <Link
            href={links.financing}
            className="transition-colors hover:text-[var(--site-primary)]"
          >
            Serviços
          </Link>
          <Link href={links.about} className="transition-colors hover:text-[var(--site-primary)]">
            Sobre nós
          </Link>
          <Link href={links.contact} className="transition-colors hover:text-[var(--site-primary)]">
            Contato
          </Link>
        </nav>
      </div>

      {/* no celular a navegação vira faixa rolável, e a busca desce para cá */}
      <div className="border-t border-[var(--site-border)] lg:hidden">
        <Form action={links.stock} className="px-6 py-2.5 md:hidden">
          <input
            name="q"
            placeholder="Pesquise por marca, modelo ou versão"
            aria-label="Buscar veículos"
            className="h-10 w-full rounded-[var(--site-radius)] border border-[var(--site-border)] bg-[var(--site-background)] px-3 text-[13px] outline-none focus:border-[var(--site-primary)]"
          />
        </Form>
        <nav className="flex gap-5 overflow-x-auto px-6 pb-2.5 text-[13px]">
          <Link href={links.stock} className="shrink-0">
            Comprar
          </Link>
          <Link href={links.financing} className="shrink-0">
            Financiamento
          </Link>
          <Link href={links.sellCar} className="shrink-0">
            Venda seu carro
          </Link>
          <Link href={links.about} className="shrink-0">
            Sobre nós
          </Link>
          <Link href={links.contact} className="shrink-0">
            Contato
          </Link>
        </nav>
      </div>
    </header>
  );
}

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
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h2
          className="text-[24px] font-bold leading-tight"
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
 * Faixa de conversa em verde claro.
 *
 * Diferente do Showroom, que usa a faixa escura: aqui o desenho pede um bloco
 * suave, que convida sem interromper a leitura da lista logo acima.
 */
export function HelpBand({
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
    <section className={`${SHELL} py-10`}>
      <div className="flex flex-wrap items-center justify-between gap-6 rounded-[var(--site-radius)] bg-[var(--site-primary)]/[0.06] px-7 py-7">
        <div>
          <p
            className="text-[19px] font-bold leading-tight"
            style={{ fontFamily: "var(--site-font-heading)" }}
          >
            {title}
          </p>
          <p className="mt-1.5 max-w-[64ch] text-[13px] text-[var(--site-muted)]">{description}</p>
        </div>
        {whatsapp ? (
          <a
            href={whatsapp}
            target="_blank"
            rel="noreferrer"
            style={{ backgroundColor: "var(--site-whatsapp)" }}
            className="inline-flex items-center gap-2 rounded-[var(--site-radius)] px-6 py-3 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
          >
            <WhatsappIcon />
            Ir para o WhatsApp
          </a>
        ) : null}
      </div>
    </section>
  );
}

/** Card de serviço, que entra na grade entre os veículos. */
export function ServiceCard({
  eyebrow,
  title,
  text,
  cta,
  href,
  external,
}: {
  eyebrow: string;
  title: string;
  text: string;
  cta: string;
  href: string;
  external?: boolean;
}) {
  return (
    <article className="flex flex-col rounded-[var(--site-radius)] border border-[var(--site-primary)]/20 bg-[var(--site-primary)]/[0.05] p-5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--site-primary)]">
        {eyebrow}
      </p>

      {/*
        O bloco do desenho.
        Ele ocupa a altura que a foto ocupa nos cards vizinhos: sem ele, o card
        de servico fica com um vazio grande antes do botao e destoa da linha.
      */}
      <div className="mt-3 aspect-16/9 rounded-[var(--site-radius)] bg-[var(--site-primary)]/10" aria-hidden="true" />
      <p
        className="mt-3 text-[19px] font-bold leading-tight"
        style={{ fontFamily: "var(--site-font-heading)" }}
      >
        {title}
      </p>
      <p className="mt-2 text-[13px] leading-relaxed text-[var(--site-muted)]">{text}</p>

      <Link
        href={href}
        {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
        className="mt-auto inline-flex justify-center rounded-[var(--site-radius)] bg-[var(--site-primary)] px-5 py-2.5 pt-2.5 text-center text-[13px] font-medium text-[var(--site-primary-foreground)] transition-colors hover:bg-[var(--site-primary-hover)]"
      >
        {cta}
      </Link>
    </article>
  );
}

function Footer({ site, links }: { site: SiteData; links: SiteLinks }) {
  const hours = summarizeHours(site.contact.businessHours);

  return (
    <footer className="border-t border-[var(--site-border)] bg-[var(--site-surface)]">
      <div className={`${SHELL} grid grid-cols-1 gap-10 py-12 sm:grid-cols-2 lg:grid-cols-4`}>
        <div>
          <p
            className="text-[15px] font-bold uppercase tracking-[0.06em] text-[var(--site-primary)]"
            style={{ fontFamily: "var(--site-font-heading)" }}
          >
            {site.name}
          </p>
          {site.contact.address.full ? (
            <p className="mt-3 text-[12px] text-[var(--site-muted)]">{site.contact.address.full}</p>
          ) : null}
          {site.contact.phone ? (
            <p className="mt-2 text-[13px] font-medium">{site.contact.phone}</p>
          ) : null}
        </div>

        <div>
          <p className="text-[13px] font-semibold">Comprar</p>
          <ul className="mt-3 space-y-2 text-[13px] text-[var(--site-muted)]">
            <li>
              <Link href={links.stock} className="hover:text-[var(--site-primary)]">
                Estoque
              </Link>
            </li>
            <li>
              <Link href={links.financing} className="hover:text-[var(--site-primary)]">
                Financiamento
              </Link>
            </li>
            <li>
              <Link href={links.sellCar} className="hover:text-[var(--site-primary)]">
                Venda seu carro
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <p className="text-[13px] font-semibold">Institucional</p>
          <ul className="mt-3 space-y-2 text-[13px] text-[var(--site-muted)]">
            <li>
              <Link href={links.about} className="hover:text-[var(--site-primary)]">
                Sobre nós
              </Link>
            </li>
            <li>
              <Link href={links.contact} className="hover:text-[var(--site-primary)]">
                Contato
              </Link>
            </li>
            {site.legal.privacy ? (
              <li>
                <Link href={links.privacy} className="hover:text-[var(--site-primary)]">
                  Política de privacidade
                </Link>
              </li>
            ) : null}
          </ul>
        </div>

        <div>
          <p className="text-[13px] font-semibold">Atendimento</p>
          <ul className="mt-3 space-y-2 text-[13px] text-[var(--site-muted)]">
            {hours.map((line) => (
              <li key={line.label}>
                {line.label}: {line.value}
              </li>
            ))}
            {site.contact.whatsapp ? <li>WhatsApp</li> : null}
          </ul>
        </div>
      </div>

      <div className="border-t border-[var(--site-border)]">
        <div className={`${SHELL} flex flex-wrap gap-x-3 py-5 text-[12px] text-[var(--site-muted)]`}>
          <span>© {site.name}. Todos os direitos reservados.</span>
          {site.legal.terms ? (
            <>
              <span>·</span>
              <Link href={links.terms} className="hover:text-[var(--site-primary)]">
                Termos de uso
              </Link>
            </>
          ) : null}
          {site.legal.privacy ? (
            <>
              <span>·</span>
              <Link href={links.privacy} className="hover:text-[var(--site-primary)]">
                Política de privacidade
              </Link>
            </>
          ) : null}
        </div>
      </div>
    </footer>
  );
}
