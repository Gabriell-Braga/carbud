import Link from "next/link";
import { Check } from "lucide-react";
import type { SiteData, SiteLinks, StockFacets } from "../contract";
import { BODY_TYPE_LABELS } from "../../lib/catalog";
import { headlineHours, summarizeHours } from "../shared/hours";
import { WhatsappIcon } from "../shared/whatsapp-icon";

/**
 * Moldura do template Vitrine: barra de serviço, cabeçalho e rodapé.
 *
 * Nenhuma cor literal — tudo sai das CSS variables do tema. É o que permite a
 * mesma estrutura servir revendas com identidades diferentes sem tocar no
 * código.
 *
 * A estrutura segue o desenho do Figma: cinco itens no menu, três colunas de
 * links no rodapé, e as listas com visto que se repetem nas páginas internas.
 */

export const SHELL = "mx-auto w-full max-w-[1200px] px-4 sm:px-6";

export function WhatsappButton({
  href,
  children = "Falar no WhatsApp",
  className = "",
  vehicleId,
}: {
  href: string | null;
  /** Liga o lead do formulário antes do WhatsApp ao carro. */
  vehicleId?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  // sem número cadastrado o botão não vira link morto: ele some
  if (!href) return null;

  return (
    <a
      href={href}
      data-vehicle-id={vehicleId}
      target="_blank"
      rel="noreferrer"
      style={{ backgroundColor: "var(--site-whatsapp)" }}
      className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 ${className}`}
    >
      <WhatsappIcon />
      {children}
    </a>
  );
}

export function PrimaryButton({
  href,
  children,
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center rounded-full bg-[var(--site-primary)] px-5 py-2.5 text-sm font-medium text-[var(--site-primary-foreground)] transition-colors hover:bg-[var(--site-primary-hover)] ${className}`}
    >
      {children}
    </Link>
  );
}

/**
 * Lista com visto, do desenho.
 *
 * Aparece no herói de quase toda página interna e dentro dos cards escuros. O
 * visto é azul no claro e branco no escuro — sobre fundo escuro o azul da
 * marca some.
 */
export function CheckList({
  items,
  tone = "light",
  className = "",
}: {
  items: string[];
  tone?: "light" | "dark";
  className?: string;
}) {
  return (
    <ul className={`space-y-2 ${className}`}>
      {items.map((item) => (
        <li
          key={item}
          className={
            tone === "dark"
              ? "flex items-start gap-2 text-sm text-white"
              : "flex items-start gap-2 text-sm text-[var(--site-text)]"
          }
        >
          <Check
            className={
              tone === "dark"
                ? "mt-0.5 h-4 w-4 shrink-0 text-white"
                : "mt-0.5 h-4 w-4 shrink-0 text-[var(--site-primary)]"
            }
            aria-hidden="true"
          />
          {item}
        </li>
      ))}
    </ul>
  );
}

/** Título de seção com subtítulo — repete em todas as páginas. */
export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        {eyebrow ? (
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--site-primary)]">
            {eyebrow}
          </p>
        ) : null}
        <h2
          className="text-[28px] font-bold leading-tight text-[var(--site-text)] sm:text-[32px]"
          style={{ fontFamily: "var(--site-font-heading)" }}
        >
          {title}
        </h2>
        {description ? (
          <p className="mt-2 text-[15px] leading-relaxed text-[var(--site-muted)]">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

/** Cartão numerado de "Como funciona" — a mesma peça em quatro páginas. */
export function StepCards({ steps }: { steps: { title: string; text: string }[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {steps.map((step, index) => (
        <div
          key={step.title}
          className="rounded-[var(--site-radius)] border border-[var(--site-border)] bg-[var(--site-surface)] p-5"
        >
          <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--site-primary)]/10 text-xs font-semibold text-[var(--site-primary)]">
            {index + 1}
          </span>
          <h3
            className="mt-3 text-base font-semibold text-[var(--site-text)]"
            style={{ fontFamily: "var(--site-font-heading)" }}
          >
            {step.title}
          </h3>
          <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--site-muted)]">{step.text}</p>
        </div>
      ))}
    </div>
  );
}

/**
 * Item em pílula com visto — "O que ter em mãos" e "O que ajuda na avaliação".
 *
 * Preenchimento cinza e SEM borda, como no desenho: a borda transformaria a
 * pílula num card, que é outro peso na página.
 *
 * `content-start` porque a coluna vizinha é mais alta. Sem isso as linhas da
 * grade esticam para acompanhá-la, e cada pílula vira um retângulo enorme com
 * uma frase colada no topo.
 */
export function CheckPills({ items }: { items: string[] }) {
  return (
    <div className="grid grid-cols-1 content-start gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <div
          key={item}
          className="flex items-center gap-2 rounded-[var(--site-radius)] bg-[var(--site-background)] px-4 py-3.5 text-[13px] font-medium text-[var(--site-text)]"
        >
          <Check className="h-3.5 w-3.5 shrink-0 text-[var(--site-primary)]" aria-hidden="true" />
          {item}
        </div>
      ))}
    </div>
  );
}

export type CategoryShortcut = { label: string; description: string; href: string };

/**
 * Atalhos de categoria, na home e no topo do estoque.
 *
 * Saem das facetas do estoque de verdade, não de uma lista fixa: oferecer
 * "Picapes" a uma revenda que só vende hatch leva a pessoa a uma busca vazia
 * já no primeiro clique. A faixa de preço fecha a lista, como no desenho.
 */
export function categoryShortcuts(facets: StockFacets, links: SiteLinks): CategoryShortcut[] {
  const DESCRICOES: Record<string, string> = {
    suv: "Mais espaço e versatilidade",
    hatch: "Práticos para a cidade",
    sedan: "Conforto para o dia a dia",
    picape: "Força e capacidade",
    minivan: "Espaço para a família",
    cupe: "Estilo e desempenho",
    conversivel: "Para dirigir aberto",
    utilitario: "Trabalho e carga",
  };

  const porCarroceria = facets.bodyTypes
    .filter((body): body is NonNullable<typeof body> => Boolean(body))
    .slice(0, 4)
    .map((body) => ({
      label: BODY_TYPE_LABELS[body],
      description: DESCRICOES[body] ?? "Veja as opções",
      href: links.stockWith({ carroceria: body }),
    }));

  const automaticos = facets.transmissions.includes("automatico")
    ? [
        {
          label: "Automáticos",
          description: "Mais conforto ao dirigir",
          href: links.stockWith({ cambio: "automatico" }),
        },
      ]
    : [];

  /*
   * Faixa de preço arredondada para baixo, em dezenas de milhar.
   *
   * O desenho traz "Até R$ 80 mil". O número sai do estoque real: prometer uma
   * faixa que a loja não tem leva a pessoa a uma lista vazia.
   */
  const teto = Math.floor(facets.priceRange.max / 100 / 10_000) * 10_000;
  const faixa =
    teto > 0
      ? [
          {
            label: `Até R$ ${teto / 1000} mil`,
            description: "Opções para seu orçamento",
            href: links.stockWith({ precoMax: teto }),
          },
        ]
      : [];

  return [...porCarroceria, ...automaticos, ...faixa];
}

/** Linha de atalhos em pílula, no herói da home e do estoque. */
export function CategoryChips({ items }: { items: { label: string; href: string }[] }) {
  if (items.length === 0) return null;

  return (
    <div className="mt-5 flex flex-wrap gap-2">
      {items.map((item) => (
        <Link
          key={item.label}
          href={item.href}
          className="rounded-full border border-[var(--site-border)] bg-[var(--site-surface)] px-4 py-1.5 text-sm text-[var(--site-text)] transition-colors hover:border-[var(--site-primary)] hover:text-[var(--site-primary)]"
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}

function TopBar({ site }: { site: SiteData }) {
  const hours = headlineHours(site.contact.businessHours);
  const place = [site.contact.address.city, site.contact.address.state]
    .filter(Boolean)
    .join(" / ");

  // sem horário nem cidade a faixa não tem o que dizer, e uma tarja escura
  // vazia no topo é pior que a ausência dela
  if (!hours && !place) return null;

  return (
    <div className="bg-[var(--site-text)] text-white/70">
      <div className={`${SHELL} flex h-9 items-center justify-between gap-4 text-xs`}>
        <span className="truncate">
          {hours ? `Atendimento online • ${hours}` : "Atendimento online"}
        </span>
        {place ? (
          <span className="hidden shrink-0 font-medium text-white/90 sm:block">{place}</span>
        ) : null}
      </div>
    </div>
  );
}

export type NavKey = "home" | "stock" | "financing" | "about" | "contact";

/**
 * Cinco itens, como no desenho.
 *
 * "Venda seu carro" NÃO entra aqui: ela mora no rodapé, na coluna
 * Institucional, e é alcançada pelos cartões de "Como podemos ajudar" e pelo
 * card de troca da ficha do veículo.
 */
function navItems(links: SiteLinks): { key: NavKey; href: string; label: string }[] {
  return [
    { key: "home", href: links.home, label: "Início" },
    { key: "stock", href: links.stock, label: "Estoque" },
    { key: "financing", href: links.financing, label: "Financiamento" },
    { key: "about", href: links.about, label: "Sobre nós" },
    { key: "contact", href: links.contact, label: "Contato" },
  ];
}

function Header({ site, links, active }: { site: SiteData; links: SiteLinks; active?: NavKey }) {
  const items = navItems(links);

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--site-border)] bg-[var(--site-surface)]">
      <div className={`${SHELL} flex h-[68px] items-center justify-between gap-6`}>
        <Link href={links.home} className="flex min-w-0 items-center gap-2.5">
          {site.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={site.logoUrl} alt={site.name} className="h-9 w-auto object-contain" />
          ) : (
            <span
              className="truncate text-base font-bold uppercase tracking-tight text-[var(--site-text)] sm:text-lg"
              style={{ fontFamily: "var(--site-font-heading)" }}
            >
              {site.name}
            </span>
          )}
        </Link>

        {/* `ml-auto`: menu, telefone e botão formam UM bloco à direita. Sem
            isso o `justify-between` joga o menu para o meio, e o desenho o
            quer encostado nas ações. */}
        <nav className="ml-auto hidden items-center gap-7 lg:flex">
          {items.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              aria-current={active === item.key ? "page" : undefined}
              className={
                active === item.key
                  ? "text-sm font-medium text-[var(--site-primary)]"
                  : "text-sm text-[var(--site-text)] transition-colors hover:text-[var(--site-primary)]"
              }
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-4">
          {site.contact.phone ? (
            <a
              href={`tel:${site.contact.phone.replace(/\D/g, "")}`}
              className="hidden text-sm text-[var(--site-text)] transition-colors hover:text-[var(--site-primary)] md:block"
            >
              {site.contact.phone}
            </a>
          ) : null}
          <WhatsappButton
            href={links.whatsapp(`Olá! Vim pelo site da ${site.name}.`)}
            className="!px-4 sm:!px-5"
          >
            <span className="sm:hidden">WhatsApp</span>
            <span className="hidden sm:inline">Falar no WhatsApp</span>
          </WhatsappButton>
        </div>
      </div>

      {/* a navegação em telas pequenas rola na horizontal: menu sanfonado
          esconderia o Estoque, que é o destino de quase toda visita */}
      <nav className="flex gap-5 overflow-x-auto border-t border-[var(--site-border)] px-4 py-2.5 lg:hidden">
        {items.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            className={
              active === item.key
                ? "shrink-0 text-sm font-medium text-[var(--site-primary)]"
                : "shrink-0 text-sm text-[var(--site-muted)]"
            }
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

function Footer({ site, links }: { site: SiteData; links: SiteLinks }) {
  const hours = summarizeHours(site.contact.businessHours);
  const address = site.contact.address.full;

  return (
    <footer className="bg-[var(--site-text)] text-white/70">
      <div className={`${SHELL} grid grid-cols-1 gap-10 py-14 md:grid-cols-2 lg:grid-cols-4`}>
        <div>
          <p
            className="text-lg font-bold uppercase tracking-tight text-white"
            style={{ fontFamily: "var(--site-font-heading)" }}
          >
            {site.name}
          </p>
          <p className="mt-3 max-w-xs text-sm leading-relaxed">
            Seu próximo carro com atendimento direto, estoque atualizado e condições para
            diferentes perfis.
          </p>
          {address ? <p className="mt-4 text-sm">{address}</p> : null}
          {site.contact.phone ? (
            <p className="mt-3 text-sm font-medium text-white">{site.contact.phone}</p>
          ) : null}
          {site.contact.email ? <p className="mt-1 text-sm">{site.contact.email}</p> : null}
        </div>

        <FooterColumn
          title="Estoque"
          items={[
            { label: "Todos os veículos", href: links.stock },
            { label: "SUVs", href: links.stockWith({ carroceria: "suv" }) },
            { label: "Hatches", href: links.stockWith({ carroceria: "hatch" }) },
            { label: "Sedans", href: links.stockWith({ carroceria: "sedan" }) },
            { label: "Picapes", href: links.stockWith({ carroceria: "picape" }) },
            // "Ofertas" do desenho: o estoque do mais barato para o mais caro
            { label: "Ofertas", href: links.stockWith({ ordem: "preco-asc" }) },
          ]}
        />

        <FooterColumn
          title="Institucional"
          items={[
            { label: "Sobre nós", href: links.about },
            { label: "Financiamento", href: links.financing },
            { label: "Venda seu carro", href: links.sellCar },
            { label: "Avaliações", href: `${links.about}#avaliacoes` },
            { label: "Contato", href: links.contact },
          ]}
        />

        <div>
          <p className="mb-4 text-sm font-semibold text-white">Atendimento</p>
          <ul className="space-y-1.5 text-sm">
            <li>WhatsApp</li>
            {hours.map((line) => (
              <li key={line.label}>
                {line.label}: {line.value}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className={`${SHELL} flex flex-wrap items-center justify-between gap-3 py-5 text-xs`}>
          <p>
            © {new Date().getFullYear()} {site.name}. Todos os direitos reservados.
          </p>
          <div className="flex flex-wrap gap-5">
            {/* link para página que não existe é pior que link ausente: leva a
                um 404 assinado pela loja */}
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

function FooterColumn({
  title,
  items,
}: {
  title: string;
  items: { label: string; href: string }[];
}) {
  return (
    <div>
      <p className="mb-4 text-sm font-semibold text-white">{title}</p>
      <ul className="space-y-1.5 text-sm">
        {items.map((item) => (
          <li key={item.label}>
            <Link href={item.href} className="transition-colors hover:text-white">
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Shell({
  site,
  links,
  active,
  children,
}: {
  site: SiteData;
  links: SiteLinks;
  active?: NavKey;
  children: React.ReactNode;
}) {
  return (
    <div
      className="min-h-screen bg-[var(--site-surface)] text-[var(--site-text)]"
      style={{ fontFamily: "var(--site-font-body)" }}
    >
      <TopBar site={site} />
      <Header site={site} links={links} active={active} />
      <main>{children}</main>
      <Footer site={site} links={links} />
    </div>
  );
}

/**
 * Faixa de conversão.
 *
 * Escura na home, no estoque e no sobre; clara no contato e no "venda seu
 * carro". As duas existem no desenho, e a escolha não é decorativa: a escura
 * corta a página em dois blocos, a clara fecha a página sem competir com o
 * rodapé, que também é escuro.
 */
export function WhatsappBand({
  site,
  links,
  title,
  description,
  tone = "dark",
  extra,
}: {
  site: SiteData;
  links: SiteLinks;
  title: string;
  description: string;
  tone?: "dark" | "light";
  extra?: React.ReactNode;
}) {
  const href = links.whatsapp(`Olá! Vim pelo site da ${site.name}.`);
  if (!href && !extra) return null;

  const inner = (
    <div className="flex flex-wrap items-center justify-between gap-6">
      <div className="max-w-xl">
        <h2
          className={
            tone === "dark"
              ? "text-2xl font-bold leading-tight text-white"
              : "text-2xl font-bold leading-tight text-[var(--site-text)]"
          }
          style={{ fontFamily: "var(--site-font-heading)" }}
        >
          {title}
        </h2>
        <p
          className={
            tone === "dark" ? "mt-2 text-sm text-white/70" : "mt-2 text-sm text-[var(--site-muted)]"
          }
        >
          {description}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {extra}
        <WhatsappButton href={href} />
      </div>
    </div>
  );

  if (tone === "light") {
    return (
      <section className={`${SHELL} py-10`}>
        <div className="rounded-[var(--site-radius)] bg-[var(--site-primary)]/[0.06] px-8 py-8">
          {inner}
        </div>
      </section>
    );
  }

  return (
    <section className="bg-[var(--site-text)] py-12">
      <div className={SHELL}>{inner}</div>
    </section>
  );
}
