import Link from "next/link";
import type { AppliedFilters, ListingProps, SiteLinks, StockFacets } from "../contract";
import { BODY_TYPE_LABELS, FUEL_LABELS, TRANSMISSION_LABELS } from "../../lib/catalog";
import type { BodyType, Fuel, Transmission } from "../../lib/catalog";
import { AutoSubmitSelect } from "../shared/auto-submit-select";
import { FilterDrawer } from "../shared/filter-drawer";
import { FilterForm, FilterSubmit } from "../shared/filter-form";
import { HelpBand, SHELL, Shell } from "./chrome";
import { VehicleGrid } from "./vehicle-card";

const SORTS = [
  { value: "recentes", label: "Mais recentes" },
  { value: "preco-asc", label: "Menor preço" },
  { value: "preco-desc", label: "Maior preço" },
  { value: "km-asc", label: "Menor quilometragem" },
  { value: "ano-desc", label: "Ano mais novo" },
];

const KM_FAIXAS = [
  { label: "Até 30 mil", value: 30000 },
  { label: "30–60 mil", value: 60000 },
  { label: "60–100 mil", value: 100000 },
  { label: "+100 mil", value: 200000 },
];

/**
 * Estoque do Marketplace.
 *
 * Coluna de filtros à esquerda, resultado à direita, e cards de serviço
 * intercalados na grade. É o desenho de quem compara muito antes de decidir.
 *
 * Os grupos de filtro são os que o nosso dado sustenta. O desenho traz também
 * Localização, Motor, Acessórios e "Especiais" — nenhum deles existe como
 * campo estruturado no cadastro, e desenhar o controle sem o dado por trás
 * produziria filtro que não filtra, que é pior do que não ter o filtro.
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

  // O mesmo form de ordenação em dois lugares, um por tamanho de tela: na
  // barra presa do celular e na linha do total no desktop.
  //
  // A `ordem` fica de fora dos campos escondidos: o servidor lê o PRIMEIRO
  // valor de cada parâmetro, e um hidden antes do select fazia a escolha
  // nova chegar em segundo — a lista não mudava nunca.
  /*
    Ordenar passa pelo mesmo caminho dos filtros: troca a lista sem recarregar
    a página e mantém a URL. Antes recarregava, e quem estava no meio da lista
    voltava para o topo só por trocar "mais recentes" por "menor preço".
  */
  const sortForm = (
    <FilterForm action={links.stock} className="flex items-center gap-2">
      {Object.entries(paramsDe(filters)).map(([nome, valor]) =>
        nome === "ordem" || valor === undefined || valor === "" ? null : (
          <input key={nome} type="hidden" name={nome} value={String(valor)} />
        ),
      )}
      <AutoSubmitSelect
        name="ordem"
        label="Ordenar"
        value={filters.sort}
        options={SORTS}
        submitLabel="Ordenar"
        className="h-10 rounded-[var(--site-radius)] border border-[var(--site-border)] bg-[var(--site-surface)] px-3 text-[13px] outline-none transition-colors focus:border-[var(--site-primary)]"
      />
    </FilterForm>
  );

  return (
    <Shell site={site} links={links}>
      <div className={`${SHELL} pt-8`}>
        <nav className="text-[12px] text-[var(--site-muted)]">
          <Link href={links.home} className="hover:text-[var(--site-primary)]">
            Home
          </Link>
          <span className="mx-2">/</span>
          <span className="text-[var(--site-text)]">Estoque</span>
        </nav>

        <h1
          className="mt-3 text-[32px] font-bold leading-tight"
          style={{ fontFamily: "var(--site-font-heading)" }}
        >
          Carros seminovos à venda
        </h1>
        <p className="mt-1.5 text-[13px] text-[var(--site-muted)]">
          Encontre o carro certo para você. Use os filtros para refinar sua busca.
        </p>
      </div>

      {/*
        No celular a coluna de filtros vira a barra presa + painel (ver
        FilterDrawer). O cabeçalho deste template não é preso, então a barra
        gruda no topo da janela; a sangria desfaz o padding do SHELL.
      */}
      <div className={`${SHELL} grid grid-cols-1 gap-6 py-6 lg:gap-8 lg:py-8 lg:grid-cols-[280px_minmax(0,1fr)]`}>
        <FilterDrawer
          filters={filters}
          sort={sortForm}
          barClassName="top-0 -mx-6 px-6"
          panelClassName="lg:sticky lg:top-6 lg:self-start"
        >
          <FilterSidebar links={links} facets={facets} filters={filters} />
        </FilterDrawer>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-[18px] font-semibold" style={{ fontFamily: "var(--site-font-heading)" }}>
              {total} {total === 1 ? "veículo encontrado" : "veículos encontrados"}
            </h2>

            <div className="hidden lg:block">{sortForm}</div>
          </div>

          <ActiveChips filters={filters} links={links} />

          {vehicles.length === 0 ? (
            <div className="mt-8 rounded-[var(--site-radius)] border border-[var(--site-border)] px-6 py-14 text-center">
              <p className="text-[16px] font-semibold" style={{ fontFamily: "var(--site-font-heading)" }}>
                Nenhum veículo com esses filtros
              </p>
              <p className="mx-auto mt-2 max-w-[48ch] text-[13px] text-[var(--site-muted)]">
                Tente remover um filtro. Se preferir, fale com a equipe: ela conhece o que está
                chegando e pode avisar quando entrar algo no seu perfil.
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
              <div key={`${page}-${filters.sort}`} className="site-enter mt-6">
                <VehicleGrid vehicles={vehicles} links={links} site={site} withServices columns={3} />
              </div>

              {pages > 1 ? (
                <nav
                  className="mt-10 flex flex-wrap items-center justify-center gap-2"
                  aria-label="Paginação"
                >
                  <PageBox href={pageHref(links, filters, page - 1)} disabled={page === 1}>
                    ‹
                  </PageBox>
                  {janela(page, pages).map((item, indice) =>
                    item === "…" ? (
                      <span key={`gap-${indice}`} className="px-1 text-[13px] text-[var(--site-muted)]">
                        …
                      </span>
                    ) : (
                      <PageBox
                        key={item}
                        href={pageHref(links, filters, item)}
                        current={item === page}
                      >
                        {item}
                      </PageBox>
                    ),
                  )}
                  <PageBox href={pageHref(links, filters, page + 1)} disabled={page === pages}>
                    ›
                  </PageBox>
                </nav>
              ) : null}
            </>
          )}
        </div>
      </div>

      <HelpBand
        site={site}
        links={links}
        title="Não encontrou o que procurava?"
        description="Conte pra gente o que você busca. A equipe pode ajudar a encontrar opções fora da sua pesquisa."
      />
    </Shell>
  );
}

function FilterSidebar({
  links,
  facets,
  filters,
}: {
  links: SiteLinks;
  facets: StockFacets;
  filters: AppliedFilters;
}) {
  const campo =
    "h-10 w-full rounded-[var(--site-radius)] border border-[var(--site-border)] bg-[var(--site-surface)] px-3 text-[13px] outline-none transition-colors focus:border-[var(--site-primary)]";

  return (
    <FilterForm action={links.stock}>
      {/* no celular o painel já tem o título "Filtros"; aqui fica só o Limpar */}
      <div className="flex items-center justify-end lg:justify-between">
        <p className="hidden text-[16px] font-semibold lg:block" style={{ fontFamily: "var(--site-font-heading)" }}>
          Filtros
        </p>
        <Link
          href={links.stock}
          scroll={false}
          className="text-[12px] text-[var(--site-primary)] hover:underline"
        >
          Limpar
        </Link>
      </div>

      <input type="hidden" name="ordem" value={filters.sort} />

      <Group title="Preço">
        <div className="grid grid-cols-2 gap-2">
          <input
            name="precoMin"
            inputMode="numeric"
            placeholder="R$ mínimo"
            defaultValue={filters.priceMin ? Math.round(filters.priceMin / 100) : ""}
            className={campo}
            aria-label="Preço mínimo"
          />
          <input
            name="precoMax"
            inputMode="numeric"
            placeholder="R$ máximo"
            defaultValue={filters.priceMax ? Math.round(filters.priceMax / 100) : ""}
            className={campo}
            aria-label="Preço máximo"
          />
        </div>
      </Group>

      <Group title="Carroceria">
        <div className="grid grid-cols-2 gap-2">
          {facets.bodyTypes
            .filter((item): item is BodyType => Boolean(item))
            .map((tipo) => (
              <Pill
                key={tipo}
                href={links.stockWith({ ...paramsDe(filters), carroceria: tipo, pagina: undefined })}
                active={filters.bodyType === tipo}
              >
                {BODY_TYPE_LABELS[tipo]}
              </Pill>
            ))}
        </div>
      </Group>

      <Group title="Marca e modelo">
        <select name="marca" defaultValue={filters.brand ?? ""} className={campo} aria-label="Marca">
          <option value="">Todas as marcas</option>
          {facets.brands.map((item) => (
            <option key={item.brand} value={item.brand}>
              {item.brand}
            </option>
          ))}
        </select>
        <input
          name="modelo"
          defaultValue={filters.model ?? ""}
          placeholder="Buscar modelo"
          className={`${campo} mt-2`}
          aria-label="Modelo"
        />
      </Group>

      <Group title="Quilometragem">
        <div className="grid grid-cols-2 gap-2">
          {KM_FAIXAS.map((faixa) => (
            <Pill
              key={faixa.value}
              href={links.stockWith({ ...paramsDe(filters), kmMax: faixa.value, pagina: undefined })}
              active={filters.kmMax === faixa.value}
            >
              {faixa.label}
            </Pill>
          ))}
        </div>
      </Group>

      <Group title="Ano">
        <div className="grid grid-cols-2 gap-2">
          <input
            name="anoMin"
            inputMode="numeric"
            placeholder="De"
            defaultValue={filters.yearMin ?? ""}
            className={campo}
            aria-label="Ano mínimo"
          />
          <input
            name="anoMax"
            inputMode="numeric"
            placeholder="Até"
            defaultValue={filters.yearMax ?? ""}
            className={campo}
            aria-label="Ano máximo"
          />
        </div>
      </Group>

      <Group title="Câmbio">
        <div className="grid grid-cols-2 gap-2">
          {facets.transmissions
            .filter((item): item is Transmission => Boolean(item))
            .map((item) => (
              <Pill
                key={item}
                href={links.stockWith({ ...paramsDe(filters), cambio: item, pagina: undefined })}
                active={filters.transmission === item}
              >
                {TRANSMISSION_LABELS[item]}
              </Pill>
            ))}
        </div>
      </Group>

      <Group title="Combustível">
        <div className="grid grid-cols-2 gap-2">
          {facets.fuels
            .filter((item): item is Fuel => Boolean(item))
            .map((item) => (
              <Pill
                key={item}
                href={links.stockWith({ ...paramsDe(filters), combustivel: item, pagina: undefined })}
                active={filters.fuel === item}
              >
                {FUEL_LABELS[item]}
              </Pill>
            ))}
        </div>
      </Group>

      <FilterSubmit className="mt-5 w-full rounded-[var(--site-radius)] bg-[var(--site-primary)] px-4 py-2.5 text-[13px] font-medium text-[var(--site-primary-foreground)] transition-colors hover:bg-[var(--site-primary-hover)]">
        Aplicar filtros
      </FilterSubmit>
    </FilterForm>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-[var(--site-radius)] border border-[var(--site-border)] p-4">
      <p className="mb-3 text-[13px] font-medium">{title}</p>
      {children}
    </div>
  );
}

/**
 * Pílula de filtro: é LINK, não checkbox.
 *
 * Cada uma leva à lista já filtrada, então funciona sem JavaScript, entra no
 * histórico do navegador e pode ser compartilhada — três coisas que um
 * checkbox controlado por script perderia.
 */
function Pill({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-pressed={active}
      className={[
        "rounded-[var(--site-radius)] border px-3 py-2 text-center text-[12px] transition-colors",
        active
          ? "border-[var(--site-primary)] bg-[var(--site-primary)]/[0.08] text-[var(--site-primary)]"
          : "border-[var(--site-border)] hover:border-[var(--site-primary)]",
      ].join(" ")}
    >
      {children}
    </Link>
  );
}

function ActiveChips({ filters, links }: { filters: AppliedFilters; links: SiteLinks }) {
  const base = paramsDe(filters);
  const chips: { label: string; href: string }[] = [];

  const semChave = (chave: string) =>
    links.stockWith({ ...base, [chave]: undefined, pagina: undefined });

  if (filters.search) chips.push({ label: `"${filters.search}"`, href: semChave("q") });
  if (filters.brand) chips.push({ label: filters.brand, href: semChave("marca") });
  if (filters.model) chips.push({ label: filters.model, href: semChave("modelo") });
  if (filters.bodyType) {
    chips.push({
      label: BODY_TYPE_LABELS[filters.bodyType as BodyType] ?? filters.bodyType,
      href: semChave("carroceria"),
    });
  }
  if (filters.transmission) {
    chips.push({
      label: TRANSMISSION_LABELS[filters.transmission as Transmission] ?? filters.transmission,
      href: semChave("cambio"),
    });
  }
  if (filters.fuel) {
    chips.push({
      label: FUEL_LABELS[filters.fuel as Fuel] ?? filters.fuel,
      href: semChave("combustivel"),
    });
  }
  if (filters.kmMax) {
    chips.push({ label: `Até ${filters.kmMax.toLocaleString("pt-BR")} km`, href: semChave("kmMax") });
  }
  if (filters.priceMax) {
    chips.push({
      label: `Até R$ ${Math.round(filters.priceMax / 100000)} mil`,
      href: semChave("precoMax"),
    });
  }

  if (chips.length === 0) return null;

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {chips.map((chip) => (
        <Link
          key={chip.label}
          href={chip.href}
          scroll={false}
          className="inline-flex items-center gap-2 rounded-full border border-[var(--site-border)] px-3.5 py-1.5 text-[12px] transition-colors hover:border-[var(--site-primary)] hover:text-[var(--site-primary)]"
        >
          {chip.label}
          <span aria-hidden="true" className="text-[var(--site-muted)]">
            ×
          </span>
          <span className="sr-only">Remover filtro</span>
        </Link>
      ))}
    </div>
  );
}

function PageBox({
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
      <span className="grid h-9 w-9 place-items-center rounded-[var(--site-radius)] border border-[var(--site-border)] text-[13px] text-[var(--site-muted)] opacity-40">
        {children}
      </span>
    );
  }

  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={[
        "grid h-9 w-9 place-items-center rounded-[var(--site-radius)] border text-[13px] transition-colors",
        current
          ? "border-[var(--site-primary)] bg-[var(--site-primary)] text-[var(--site-primary-foreground)]"
          : "border-[var(--site-border)] hover:border-[var(--site-primary)]",
      ].join(" ")}
    >
      {children}
    </Link>
  );
}

/** Os filtros atuais como parâmetros de URL, para preservá-los em cada link. */
function paramsDe(filters: AppliedFilters): Record<string, string | number | undefined> {
  return {
    q: filters.search,
    marca: filters.brand,
    modelo: filters.model,
    carroceria: filters.bodyType,
    cambio: filters.transmission,
    combustivel: filters.fuel,
    anoMin: filters.yearMin,
    anoMax: filters.yearMax,
    kmMax: filters.kmMax,
    precoMin: filters.priceMin ? Math.round(filters.priceMin / 100) : undefined,
    precoMax: filters.priceMax ? Math.round(filters.priceMax / 100) : undefined,
    ordem: filters.sort,
  };
}

function pageHref(links: SiteLinks, filters: AppliedFilters, page: number): string {
  return links.stockWith({ ...paramsDe(filters), pagina: page > 1 ? page : undefined });
}

function janela(atual: number, total: number): (number | "…")[] {
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
