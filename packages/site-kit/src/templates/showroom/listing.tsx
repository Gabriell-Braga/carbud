import Link from "next/link";
import type { AppliedFilters, ListingProps, SiteLinks, StockFacets } from "../contract";
import { BODY_TYPE_LABELS, FUEL_LABELS, TRANSMISSION_LABELS } from "../../lib/catalog";
import type { BodyType, Fuel, Transmission } from "../../lib/catalog";
import { AutoSubmitSelect } from "../shared/auto-submit-select";
import { FilterDrawer } from "../shared/filter-drawer";
import { FilterForm, FilterSubmit } from "../shared/filter-form";
import { HERO_GRADIENT, HERO_VARS, SHELL, Shell, TalkBand } from "./chrome";
import { VehicleGrid } from "./vehicle-card";

const SORTS = [
  { value: "recentes", label: "Mais recentes" },
  { value: "preco-asc", label: "Menor preço" },
  { value: "preco-desc", label: "Maior preço" },
  { value: "km-asc", label: "Menor quilometragem" },
  { value: "ano-desc", label: "Ano mais novo" },
];

const campo =
  "h-11 w-full rounded-[var(--site-radius)] border border-[var(--site-border)] bg-[var(--site-surface)] px-3 text-[13px] text-[var(--site-text)] outline-none transition-colors focus:border-[var(--site-primary)]";

/**
 * Estoque do Showroom.
 *
 * Os filtros ficam numa faixa horizontal no topo, e não numa coluna lateral
 * como no Vitrine. É a diferença mais visível entre os dois desenhos, e ela
 * muda o comportamento: aqui a grade ocupa a largura toda e cabe uma linha de
 * quatro cards, que é o que o desenho mostra.
 */
export function Listing({
  site,
  links,
  vehicles,
  facets,
  filters,
  total,
  page,
  pageSize,
}: ListingProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const banner = site.banners[0]?.imageUrl ?? null;

  const sortClass =
    "h-10 rounded-[var(--site-radius)] border border-[var(--site-border)] bg-[var(--site-surface)] px-3 text-[13px] outline-none transition-colors focus:border-[var(--site-primary)]";

  // a ordenação da barra presa do celular: um form só dela, que reenvia os
  // filtros aplicados — no desktop o select mora dentro do form da faixa
  /*
    Ordenar passa pelo mesmo caminho dos filtros: troca a lista sem recarregar
    a página e mantém a URL. Antes recarregava, e quem estava no meio da lista
    voltava para o topo só por trocar "mais recentes" por "menor preço".
  */
  const sortForm = (
    <FilterForm action={links.stock}>
      {Object.entries(paramsDe(filters)).map(([nome, valor]) =>
        valor === undefined || valor === "" ? null : (
          <input key={nome} type="hidden" name={nome} value={String(valor)} />
        ),
      )}
      <AutoSubmitSelect
        name="ordem"
        label="Ordenar"
        value={filters.sort}
        options={SORTS}
        submitLabel="Ordenar"
        className={sortClass}
      />
    </FilterForm>
  );

  return (
    <Shell site={site} links={links} overlay>
      {/* ----------------------------------------------------------- herói */}
      <section className={"pb-16 pt-28 text-white " + HERO_GRADIENT} style={HERO_VARS}>
        <div className={`${SHELL} text-center`}>
          <h1
            className="text-[36px] leading-tight sm:text-[44px]"
            style={{ fontFamily: "var(--site-font-heading)" }}
          >
            Encontre seu próximo carro
          </h1>
          <p className="mx-auto mt-3 max-w-[56ch] text-[13px] text-white/70">
            Compare versões, preços e condições em um estoque selecionado pela loja.
          </p>

          <div className="mt-8 aspect-[21/7] overflow-hidden rounded-[var(--site-radius)] bg-white/15">
            {banner ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={banner} alt={site.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-[11px] uppercase tracking-[0.14em] text-white/60">
                Foto / vídeo do estoque
              </div>
            )}
          </div>
        </div>
      </section>

      {/*
        ------------------------------------------------- faixa de filtros
        No celular a faixa vira a barra presa + painel (ver FilterDrawer);
        no desktop continua a faixa de sempre. O div em volta existe para
        ser o pai da barra E do resultado: sticky só acompanha enquanto o
        pai está na tela. O topo é a altura do cabeçalho fixo (64px).
      */}
      <div>
      <FilterDrawer filters={filters} sort={sortForm} barClassName="top-16 px-6">
      <section className="lg:border-b lg:border-[var(--site-border)] lg:bg-[var(--site-surface)] lg:py-6">
        <div className="lg:mx-auto lg:w-full lg:max-w-[1280px] lg:px-6">
          <FilterForm action={links.stock}>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex gap-6">
                {[
                  { label: "Todos", href: links.stock },
                  { label: "Seminovos", href: links.stockWith({ ordem: "km-asc" }) },
                  { label: "Ofertas", href: links.stockWith({ ordem: "preco-asc" }) },
                ].map((aba, indice) => (
                  <Link
                    key={aba.label}
                    href={aba.href}
                    className={
                      indice === 0
                        ? "text-[13px] font-medium text-[var(--site-primary)]"
                        : "text-[13px] text-[var(--site-muted)] transition-colors hover:text-[var(--site-text)]"
                    }
                  >
                    {aba.label}
                  </Link>
                ))}
              </div>

              {/* a ordem aplica sozinha; os filtros abaixo esperam o botão,
                  porque mexer num deles quase sempre implica mexer em outro.
                  No celular ela já está na barra presa, então some daqui. */}
              <div className="hidden lg:block">
                <AutoSubmitSelect
                  name="ordem"
                  label="Ordenar"
                  value={filters.sort}
                  options={SORTS}
                  submitLabel="Ordenar"
                  className={sortClass}
                />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(6,minmax(0,1fr))_auto]">
              <select name="marca" defaultValue={filters.brand ?? ""} className={campo} aria-label="Marca">
                <option value="">Marca</option>
                {facets.brands.map((item) => (
                  <option key={item.brand} value={item.brand}>
                    {item.brand}
                  </option>
                ))}
              </select>

              <input
                name="modelo"
                defaultValue={filters.model ?? ""}
                placeholder="Modelo"
                className={campo}
                aria-label="Modelo"
              />

              <select
                name="anoMin"
                defaultValue={filters.yearMin ? String(filters.yearMin) : ""}
                className={campo}
                aria-label="Ano mínimo"
              >
                <option value="">Ano</option>
                {anosDe(facets).map((ano) => (
                  <option key={ano} value={ano}>
                    A partir de {ano}
                  </option>
                ))}
              </select>

              <select
                name="precoMax"
                defaultValue={filters.priceMax ? String(Math.round(filters.priceMax / 100)) : ""}
                className={campo}
                aria-label="Preço máximo"
              >
                <option value="">Preço</option>
                <option value="50000">Até R$ 50 mil</option>
                <option value="80000">Até R$ 80 mil</option>
                <option value="120000">Até R$ 120 mil</option>
                <option value="180000">Até R$ 180 mil</option>
              </select>

              <select
                name="cambio"
                defaultValue={filters.transmission ?? ""}
                className={campo}
                aria-label="Câmbio"
              >
                <option value="">Câmbio</option>
                {facets.transmissions
                  .filter((item): item is Transmission => Boolean(item))
                  .map((item) => (
                    <option key={item} value={item}>
                      {TRANSMISSION_LABELS[item]}
                    </option>
                  ))}
              </select>

              <select
                name="combustivel"
                defaultValue={filters.fuel ?? ""}
                className={campo}
                aria-label="Combustível"
              >
                <option value="">Combustível</option>
                {facets.fuels
                  .filter((item): item is Fuel => Boolean(item))
                  .map((item) => (
                    <option key={item} value={item}>
                      {FUEL_LABELS[item]}
                    </option>
                  ))}
              </select>

              <FilterSubmit className="h-11 rounded-[var(--site-radius)] bg-[var(--site-primary)] px-8 text-[13px] font-medium text-[var(--site-primary-foreground)] transition-colors hover:bg-[var(--site-primary-hover)]">
                Filtrar
              </FilterSubmit>
            </div>
          </FilterForm>
        </div>
      </section>
      </FilterDrawer>

      {/* --------------------------------------------------------- resultado */}
      <section className="bg-[var(--site-background)] py-10">
        <div className={SHELL}>
          <h2
            className="text-[22px] leading-tight"
            style={{ fontFamily: "var(--site-font-heading)" }}
          >
            {total} {total === 1 ? "veículo encontrado" : "veículos encontrados"}
          </h2>

          <FilterChips filters={filters} links={links} />

          {vehicles.length === 0 ? (
            <div className="mt-10 rounded-[var(--site-radius)] bg-[var(--site-surface)] px-6 py-14 text-center">
              <p className="text-[15px]" style={{ fontFamily: "var(--site-font-heading)" }}>
                Nenhum veículo com esses filtros
              </p>
              <p className="mx-auto mt-2 max-w-[48ch] text-[13px] text-[var(--site-muted)]">
                Tente remover um filtro, ou fale com a equipe: ela conhece o que está chegando e
                pode avisar quando entrar algo no seu perfil.
              </p>
              <Link
                href={links.stock}
                className="mt-6 inline-flex rounded-[var(--site-radius)] bg-[var(--site-primary)] px-5 py-2.5 text-[13px] font-medium text-[var(--site-primary-foreground)]"
              >
                Ver todo o estoque
              </Link>
            </div>
          ) : (
            <>
              {/* a chave remonta a grade a cada página ou ordem, e a animação
                  de entrada roda de novo — sem isso a troca parece um piscar */}
              <div key={`${page}-${filters.sort}`} className="site-enter mt-6">
                <VehicleGrid vehicles={vehicles} links={links} storeName={site.name} columns={4} />
              </div>

              {pages > 1 ? (
                <nav
                  className="mt-12 flex flex-wrap items-center justify-center gap-2"
                  aria-label="Paginação"
                >
                  <PageLink href={pageHref(links, filters, page - 1)} disabled={page === 1}>
                    ←
                  </PageLink>

                  {janelaDePaginas(page, pages).map((item, indice) =>
                    item === "…" ? (
                      <span key={`gap-${indice}`} className="px-1 text-[13px] text-[var(--site-muted)]">
                        …
                      </span>
                    ) : (
                      <PageLink
                        key={item}
                        href={pageHref(links, filters, item)}
                        current={item === page}
                      >
                        {item}
                      </PageLink>
                    ),
                  )}

                  <PageLink href={pageHref(links, filters, page + 1)} disabled={page === pages}>
                    →
                  </PageLink>
                </nav>
              ) : null}
            </>
          )}
        </div>
      </section>
      </div>

      <TalkBand
        site={site}
        links={links}
        title="Quer ajuda para escolher?"
        description="Fale com a equipe e receba opções compatíveis com o que você procura."
      />
    </Shell>
  );
}

/**
 * Os filtros ativos, cada um removível.
 *
 * Sem eles a pessoa vê "3 veículos encontrados" sem lembrar por quê, e o
 * caminho de volta vira recomeçar do zero.
 */
function FilterChips({ filters, links }: { filters: AppliedFilters; links: SiteLinks }) {
  const ativos: { label: string; remover: Record<string, string | number | undefined> }[] = [];
  const base = {
    q: filters.search,
    marca: filters.brand,
    modelo: filters.model,
    carroceria: filters.bodyType,
    cambio: filters.transmission,
    combustivel: filters.fuel,
    anoMin: filters.yearMin,
    precoMax: filters.priceMax ? Math.round(filters.priceMax / 100) : undefined,
    ordem: filters.sort,
  };

  const adicionar = (chave: keyof typeof base, label: string) => {
    ativos.push({ label, remover: { ...base, [chave]: undefined } });
  };

  if (filters.search) adicionar("q", `"${filters.search}"`);
  if (filters.brand) adicionar("marca", filters.brand);
  if (filters.model) adicionar("modelo", filters.model);
  if (filters.bodyType) {
    adicionar("carroceria", BODY_TYPE_LABELS[filters.bodyType as BodyType] ?? filters.bodyType);
  }
  if (filters.transmission) {
    adicionar("cambio", TRANSMISSION_LABELS[filters.transmission as Transmission] ?? filters.transmission);
  }
  if (filters.fuel) adicionar("combustivel", FUEL_LABELS[filters.fuel as Fuel] ?? filters.fuel);
  if (filters.yearMin) adicionar("anoMin", `A partir de ${filters.yearMin}`);
  if (filters.priceMax) {
    adicionar("precoMax", `Até R$ ${Math.round(filters.priceMax / 100000)} mil`);
  }

  if (ativos.length === 0) return null;

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      {ativos.map((chip) => (
        <Link
          key={chip.label}
          href={links.stockWith(chip.remover)}
          scroll={false}
          className="inline-flex items-center gap-2 rounded-full bg-[var(--site-surface)] px-3.5 py-1.5 text-[12px] transition-colors hover:text-[var(--site-primary)]"
        >
          {chip.label}
          <span aria-hidden="true" className="text-[var(--site-muted)]">
            ×
          </span>
          <span className="sr-only">Remover filtro</span>
        </Link>
      ))}
      <Link
        href={links.stock}
        scroll={false}
        className="text-[12px] text-[var(--site-primary)] transition-colors hover:underline"
      >
        Limpar tudo
      </Link>
    </div>
  );
}

function PageLink({
  href,
  children,
  current,
  disabled,
}: {
  href: string;
  children: React.ReactNode;
  current?: boolean;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <span className="grid h-10 w-10 place-items-center rounded-[var(--site-radius)] bg-[var(--site-surface)] text-[13px] text-[var(--site-muted)] opacity-40">
        {children}
      </span>
    );
  }

  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={[
        "grid h-10 w-10 place-items-center rounded-[var(--site-radius)] text-[13px] transition-colors",
        current
          ? "bg-[var(--site-primary)] text-[var(--site-primary-foreground)]"
          : "bg-[var(--site-surface)] hover:text-[var(--site-primary)]",
      ].join(" ")}
    >
      {children}
    </Link>
  );
}

/** Os filtros aplicados no formato da URL, para reenviar num link ou num form. */
function paramsDe(filters: AppliedFilters): Record<string, string | number | undefined> {
  return {
    q: filters.search,
    marca: filters.brand,
    modelo: filters.model,
    carroceria: filters.bodyType,
    cambio: filters.transmission,
    combustivel: filters.fuel,
    anoMin: filters.yearMin,
    precoMax: filters.priceMax ? Math.round(filters.priceMax / 100) : undefined,
  };
}

function pageHref(links: SiteLinks, filters: AppliedFilters, page: number): string {
  return links.stockWith({
    ...paramsDe(filters),
    ordem: filters.sort,
    pagina: page > 1 ? page : undefined,
  });
}

/** Até sete casas, com reticências quando o meio some. */
function janelaDePaginas(atual: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const itens: (number | "…")[] = [1];
  const inicio = Math.max(2, atual - 1);
  const fim = Math.min(total - 1, atual + 1);

  if (inicio > 2) itens.push("…");
  for (let i = inicio; i <= fim; i++) itens.push(i);
  if (fim < total - 1) itens.push("…");

  itens.push(total);
  return itens;
}

function anosDe(facets: StockFacets): number[] {
  const maior = facets.yearRange.max || new Date().getFullYear();
  const menor = facets.yearRange.min || maior - 4;
  const anos: number[] = [];
  for (let ano = maior; ano >= menor && anos.length < 6; ano--) anos.push(ano);
  return anos;
}
