import Link from "next/link";
import { Search } from "lucide-react";
import type { ListingProps, StockFacets } from "../contract";
import type { BodyType, Fuel, Transmission } from "../../lib/catalog";
import { BODY_TYPE_LABELS, FUEL_LABELS, TRANSMISSION_LABELS } from "../../lib/catalog";
import { AutoSubmitSelect } from "../shared/auto-submit-select";
import { FilterDrawer } from "../shared/filter-drawer";
import { FilterForm, FilterSubmit } from "../shared/filter-form";
import { CategoryChips, SHELL, Shell, WhatsappBand, WhatsappButton, categoryShortcuts } from "./chrome";
import { VehicleGrid } from "./vehicle-card";

const SORTS = [
  { value: "recentes", label: "Mais recentes" },
  { value: "preco-asc", label: "Menor preço" },
  { value: "preco-desc", label: "Maior preço" },
  { value: "km-asc", label: "Menor quilometragem" },
  { value: "ano-desc", label: "Ano mais novo" },
];

const field =
  "h-11 w-full rounded-lg border border-[var(--site-border)] bg-[var(--site-surface)] px-3 text-sm text-[var(--site-text)] outline-none focus:border-[var(--site-primary)]";

const label = "mb-1.5 block text-xs font-medium text-[var(--site-muted)]";

/**
 * Filtros na lateral, como um formulário GET.
 *
 * Sem estado e sem JavaScript: o resultado precisa ser um endereço que a
 * pessoa consiga mandar no WhatsApp para o marido ver. Filtro que vive só na
 * memória do navegador produz uma página que ninguém consegue compartilhar.
 */
function Filters({
  facets,
  filters,
  action,
}: {
  facets: StockFacets;
  filters: ListingProps["filters"];
  action: string;
}) {
  const models =
    facets.brands.find((item) => item.brand === filters.brand)?.models ??
    // sem marca escolhida, listar todos os modelos vira uma lista de centenas
    [];

  return (
    <FilterForm
      action={action}
      className="rounded-[var(--site-radius)] border border-[var(--site-border)] bg-[var(--site-surface)] p-5"
    >
      {/* no celular o painel já tem o título "Filtros"; aqui fica só o Limpar */}
      <div className="mb-4 flex items-center justify-end lg:justify-between">
        <p
          className="hidden text-lg font-semibold text-[var(--site-text)] lg:block"
          style={{ fontFamily: "var(--site-font-heading)" }}
        >
          Filtros
        </p>
        <Link
          href={action}
          scroll={false}
          className="text-xs font-medium text-[var(--site-primary)]"
        >
          Limpar tudo
        </Link>
      </div>

      {/* a ordenação viaja junto para não se perder ao aplicar um filtro */}
      <input type="hidden" name="ordem" value={filters.sort} />

      <div className="grid gap-3">
        <div>
          <label className={label} htmlFor="f-q">
            Buscar
          </label>
          <input
            id="f-q"
            name="q"
            defaultValue={filters.search ?? ""}
            placeholder="Marca, modelo ou versão"
            className={field}
          />
        </div>

        <div>
          <label className={label} htmlFor="f-marca">
            Marca
          </label>
          <select id="f-marca" name="marca" defaultValue={filters.brand ?? ""} className={field}>
            <option value="">Todas</option>
            {facets.brands.map((item) => (
              <option key={item.brand} value={item.brand}>
                {item.brand}
              </option>
            ))}
          </select>
        </div>

        {models.length > 0 ? (
          <div>
            <label className={label} htmlFor="f-modelo">
              Modelo
            </label>
            <select
              id="f-modelo"
              name="modelo"
              defaultValue={filters.model ?? ""}
              className={field}
            >
              <option value="">Todos</option>
              {models.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div>
          <label className={label} htmlFor="f-carroceria">
            Carroceria
          </label>
          <select
            id="f-carroceria"
            name="carroceria"
            defaultValue={filters.bodyType ?? ""}
            className={field}
          >
            <option value="">Todas</option>
            {facets.bodyTypes
              .filter((value): value is NonNullable<typeof value> => Boolean(value))
              .map((value) => (
                <option key={value} value={value}>
                  {BODY_TYPE_LABELS[value]}
                </option>
              ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label} htmlFor="f-preco-min">
              Preço mín.
            </label>
            <input
              id="f-preco-min"
              name="precoMin"
              inputMode="numeric"
              defaultValue={filters.priceMin ? Math.round(filters.priceMin / 100) : ""}
              placeholder="R$"
              className={field}
            />
          </div>
          <div>
            <label className={label} htmlFor="f-preco-max">
              Preço máx.
            </label>
            <input
              id="f-preco-max"
              name="precoMax"
              inputMode="numeric"
              defaultValue={filters.priceMax ? Math.round(filters.priceMax / 100) : ""}
              placeholder="R$"
              className={field}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label} htmlFor="f-ano-min">
              Ano mín.
            </label>
            <input
              id="f-ano-min"
              name="anoMin"
              inputMode="numeric"
              defaultValue={filters.yearMin ?? ""}
              placeholder={String(facets.yearRange.min || "")}
              className={field}
            />
          </div>
          <div>
            <label className={label} htmlFor="f-km-max">
              Km máx.
            </label>
            <input
              id="f-km-max"
              name="kmMax"
              inputMode="numeric"
              defaultValue={filters.kmMax ?? ""}
              placeholder="100000"
              className={field}
            />
          </div>
        </div>

        <div>
          <label className={label} htmlFor="f-cambio">
            Câmbio
          </label>
          <select
            id="f-cambio"
            name="cambio"
            defaultValue={filters.transmission ?? ""}
            className={field}
          >
            <option value="">Todos</option>
            {facets.transmissions
              .filter((value): value is NonNullable<typeof value> => Boolean(value))
              .map((value) => (
                <option key={value} value={value}>
                  {TRANSMISSION_LABELS[value]}
                </option>
              ))}
          </select>
        </div>

        <div>
          <label className={label} htmlFor="f-combustivel">
            Combustível
          </label>
          <select
            id="f-combustivel"
            name="combustivel"
            defaultValue={filters.fuel ?? ""}
            className={field}
          >
            <option value="">Todos</option>
            {facets.fuels
              .filter((value): value is NonNullable<typeof value> => Boolean(value))
              .map((value) => (
                <option key={value} value={value}>
                  {FUEL_LABELS[value]}
                </option>
              ))}
          </select>
        </div>
      </div>

      <FilterSubmit className="mt-5 w-full rounded-lg bg-[var(--site-primary)] px-4 py-2.5 text-sm font-medium text-[var(--site-primary-foreground)] transition-colors hover:bg-[var(--site-primary-hover)]">
        Aplicar filtros
      </FilterSubmit>
    </FilterForm>
  );
}

/** Paginação com reticências — lista de 40 páginas não cabe na linha. */
function pageWindow(page: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);

  const pages = new Set<number>([1, total, page, page - 1, page + 1]);
  const ordered = [...pages].filter((value) => value >= 1 && value <= total).sort((a, b) => a - b);

  const result: (number | "…")[] = [];
  let previous = 0;
  for (const value of ordered) {
    if (previous && value - previous > 1) result.push("…");
    result.push(value);
    previous = value;
  }
  return result;
}

/**
 * Chips do que está filtrado agora, com o "x" que remove só aquele filtro.
 *
 * Sem eles a pessoa vê "3 veículos encontrados" e não sabe POR QUE são três —
 * o painel lateral pode estar fora da tela, e a única saída visível seria
 * "Limpar tudo", que joga fora os outros filtros junto.
 */
function activeChips(
  filters: ListingProps["filters"],
  links: ListingProps["links"],
): { label: string; href: string }[] {
  const base = {
    q: filters.search,
    marca: filters.brand,
    modelo: filters.model,
    carroceria: filters.bodyType,
    cambio: filters.transmission,
    combustivel: filters.fuel,
    precoMin: filters.priceMin ? Math.round(filters.priceMin / 100) : undefined,
    precoMax: filters.priceMax ? Math.round(filters.priceMax / 100) : undefined,
    anoMin: filters.yearMin,
    kmMax: filters.kmMax,
    ordem: filters.sort,
  };

  const rotulos: { chave: keyof typeof base; texto: string }[] = [
    { chave: "q", texto: filters.search ? `"${filters.search}"` : "" },
    { chave: "marca", texto: filters.brand ?? "" },
    { chave: "modelo", texto: filters.model ?? "" },
    {
      chave: "carroceria",
      texto: filters.bodyType ? BODY_TYPE_LABELS[filters.bodyType as BodyType] : "",
    },
    {
      chave: "cambio",
      texto: filters.transmission
        ? TRANSMISSION_LABELS[filters.transmission as Transmission]
        : "",
    },
    {
      chave: "combustivel",
      texto: filters.fuel ? FUEL_LABELS[filters.fuel as Fuel] : "",
    },
    { chave: "precoMin", texto: base.precoMin ? `A partir de R$ ${base.precoMin}` : "" },
    { chave: "precoMax", texto: base.precoMax ? `Até R$ ${base.precoMax}` : "" },
    { chave: "anoMin", texto: filters.yearMin ? `A partir de ${filters.yearMin}` : "" },
    { chave: "kmMax", texto: filters.kmMax ? `Até ${filters.kmMax} km` : "" },
  ];

  return rotulos
    .filter((item) => item.texto)
    .map((item) => ({
      label: item.texto,
      // o link remove só este filtro e mantém os outros
      href: links.stockWith({ ...base, [item.chave]: undefined }),
    }));
}

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
  const chips = activeChips(filters, links);

  /*
    Trocar a ordem preserva os filtros: o form reenvia todos eles.
    O select aplica sozinho — o botao "Ordenar" que existia ao lado
    fazia a pessoa escolher, olhar a lista igual, e achar que quebrou.

    E uma funcao porque o mesmo form aparece em dois lugares, um por
    tamanho de tela: na barra presa do celular e na linha do total no
    desktop. Cada um so existe no seu tamanho, entao nunca ha dois na tela.
  */
  /*
    Ordenar passa pelo mesmo caminho dos filtros: troca a lista sem recarregar
    a página e mantém a URL. Antes recarregava, e quem estava no meio da lista
    voltava para o topo só por trocar "mais recentes" por "menor preço".
  */
  const sortForm = (
    <FilterForm action={links.stock} className="flex items-center gap-2">
      {Object.entries({
        q: filters.search,
        marca: filters.brand,
        modelo: filters.model,
        carroceria: filters.bodyType,
        cambio: filters.transmission,
        combustivel: filters.fuel,
        precoMin: filters.priceMin ? Math.round(filters.priceMin / 100) : undefined,
        precoMax: filters.priceMax ? Math.round(filters.priceMax / 100) : undefined,
        anoMin: filters.yearMin,
        kmMax: filters.kmMax,
      })
        .filter(([, value]) => value !== undefined && value !== "")
        .map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={String(value)} />
        ))}
      <AutoSubmitSelect
        name="ordem"
        label="Ordenar"
        value={filters.sort}
        options={SORTS}
        submitLabel="Ordenar"
        className="h-11 rounded-lg border border-[var(--site-border)] bg-[var(--site-surface)] px-3 text-sm text-[var(--site-text)] outline-none transition-colors focus:border-[var(--site-primary)]"
      />
    </FilterForm>
  );

  const withPage = (target: number) =>
    links.stockWith({
      q: filters.search,
      marca: filters.brand,
      modelo: filters.model,
      carroceria: filters.bodyType,
      cambio: filters.transmission,
      combustivel: filters.fuel,
      precoMin: filters.priceMin ? Math.round(filters.priceMin / 100) : undefined,
      precoMax: filters.priceMax ? Math.round(filters.priceMax / 100) : undefined,
      anoMin: filters.yearMin,
      kmMax: filters.kmMax,
      ordem: filters.sort,
      pagina: target > 1 ? target : undefined,
    });

  return (
    <Shell site={site} links={links} active="stock">
      <section className="border-b border-[var(--site-border)] bg-[var(--site-background)]">
        <div className={`${SHELL} py-12`}>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--site-primary)]">
            Estoque atualizado todos os dias
          </p>
          <h1
            className="text-[34px] font-bold leading-tight text-[var(--site-text)] sm:text-[40px]"
            style={{ fontFamily: "var(--site-font-heading)" }}
          >
            Encontre seu próximo carro
          </h1>
          <p className="mt-3 max-w-xl text-[15px] text-[var(--site-muted)]">
            Explore o estoque da loja, compare opções e fale diretamente com a nossa equipe.
          </p>

          <form action={links.stock} method="get" className="mt-7 flex max-w-2xl gap-2">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--site-muted)]"
                aria-hidden="true"
              />
              <input
                type="search"
                name="q"
                defaultValue={filters.search ?? ""}
                placeholder="Busque por marca, modelo ou versão"
                aria-label="Buscar no estoque"
                className="h-12 w-full rounded-[var(--site-radius)] border border-[var(--site-border)] bg-[var(--site-surface)] pl-11 pr-4 text-sm text-[var(--site-text)] outline-none placeholder:text-[var(--site-muted)] focus:border-[var(--site-primary)]"
              />
            </div>
            <button
              type="submit"
              className="shrink-0 rounded-[var(--site-radius)] bg-[var(--site-primary)] px-6 text-sm font-medium text-[var(--site-primary-foreground)] transition-colors hover:bg-[var(--site-primary-hover)]"
            >
              Buscar
            </button>
          </form>

          <CategoryChips items={categoryShortcuts(facets, links)} />
        </div>
      </section>

      {/*
        No celular a coluna de filtros vira a barra presa + painel (ver
        FilterDrawer). O grid é o pai da barra de propósito: é ele que se
        estende pela lista inteira, e é dentro do pai que o sticky funciona.
        O topo da barra é a altura do cabeçalho do Vitrine no celular (68px
        de barra + 41px do menu que rola), e a sangria desfaz o padding do
        SHELL para a barra ir de borda a borda.
      */}
      <div className={`${SHELL} grid grid-cols-1 gap-6 py-8 lg:gap-8 lg:py-12 lg:grid-cols-[280px_minmax(0,1fr)]`}>
        <FilterDrawer
          filters={filters}
          sort={sortForm}
          barClassName="top-[110px] -mx-4 sm:-mx-6 sm:px-6"
          panelClassName="lg:sticky lg:top-24 lg:self-start"
        >
          <Filters facets={facets} filters={filters} action={links.stock} />
        </FilterDrawer>

        <div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
            <p
              className="text-xl font-semibold text-[var(--site-text)]"
              style={{ fontFamily: "var(--site-font-heading)" }}
            >
              {total} {total === 1 ? "veículo encontrado" : "veículos encontrados"}
            </p>

            <div className="hidden lg:block">{sortForm}</div>
          </div>

          {chips.length > 0 ? (
            <div className="mb-6 flex flex-wrap gap-2">
              {chips.map((chip) => (
                <Link
                  key={chip.label}
                  href={chip.href}
                  scroll={false}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[var(--site-primary)]/10 px-3 py-1.5 text-[13px] text-[var(--site-primary)] transition-colors hover:bg-[var(--site-primary)]/20"
                >
                  {chip.label}
                  <span aria-hidden="true">×</span>
                  <span className="sr-only">remover filtro</span>
                </Link>
              ))}
            </div>
          ) : null}

          {vehicles.length === 0 ? (
            <div className="rounded-[var(--site-radius)] border border-[var(--site-border)] bg-[var(--site-surface)] px-6 py-20 text-center">
              <Search className="mx-auto h-6 w-6 text-[var(--site-muted)]" aria-hidden="true" />
              <p
                className="mt-4 text-lg font-semibold text-[var(--site-text)]"
                style={{ fontFamily: "var(--site-font-heading)" }}
              >
                Nenhum veículo encontrado
              </p>
              <p className="mx-auto mt-2 max-w-sm text-sm text-[var(--site-muted)]">
                Tente ampliar a busca ou fale com a equipe: podemos ter o carro que você procura
                chegando em breve.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <Link
                  href={links.stock}
                  className="rounded-full border border-[var(--site-border)] px-5 py-2.5 text-sm font-medium text-[var(--site-text)] transition-colors hover:border-[var(--site-primary)]"
                >
                  Limpar filtros
                </Link>
                <WhatsappButton
                  href={links.whatsapp(
                    `Olá! Procuro um carro que não encontrei no site da ${site.name}.`,
                  )}
                />
              </div>
            </div>
          ) : (
            <>
              {/*
                A chave inclui a página e a ordem: o React remonta o bloco
                quando qualquer uma das duas muda, e a animação de entrada roda
                de novo. Sem isso, virar a página trocaria o conteúdo sem
                nenhum sinal de que algo aconteceu.
              */}
              <div key={`${page}-${filters.sort}`} className="site-enter">
                <VehicleGrid vehicles={vehicles} links={links} storeName={site.name} columns={3} />
              </div>

              {pages > 1 ? (
                <nav className="mt-10 flex flex-wrap items-center justify-center gap-2" aria-label="Paginação">
                  {page > 1 ? (
                    <Link
                      href={withPage(page - 1)}
                      rel="prev"
                      aria-label="Página anterior"
                      className="grid h-10 w-10 place-items-center rounded-lg border border-[var(--site-border)] text-[var(--site-text)] transition-colors hover:border-[var(--site-primary)]"
                    >
                      ←
                    </Link>
                  ) : null}

                  {pageWindow(page, pages).map((item, index) =>
                    item === "…" ? (
                      <span
                        key={`gap-${index}`}
                        className="grid h-10 w-10 place-items-center text-sm text-[var(--site-muted)]"
                      >
                        …
                      </span>
                    ) : (
                      <Link
                        key={item}
                        href={withPage(item)}
                        aria-current={item === page ? "page" : undefined}
                        className={
                          item === page
                            ? "grid h-10 w-10 place-items-center rounded-lg bg-[var(--site-primary)] text-sm font-medium text-[var(--site-primary-foreground)]"
                            : "grid h-10 w-10 place-items-center rounded-lg border border-[var(--site-border)] text-sm text-[var(--site-text)] transition-colors hover:border-[var(--site-primary)]"
                        }
                      >
                        {item}
                      </Link>
                    ),
                  )}

                  {page < pages ? (
                    <Link
                      href={withPage(page + 1)}
                      rel="next"
                      aria-label="Próxima página"
                      className="grid h-10 w-10 place-items-center rounded-lg border border-[var(--site-border)] text-[var(--site-text)] transition-colors hover:border-[var(--site-primary)]"
                    >
                      →
                    </Link>
                  ) : null}
                </nav>
              ) : null}
            </>
          )}
        </div>
      </div>

      <WhatsappBand
        site={site}
        links={links}
        title="Ainda não encontrou o carro ideal?"
        description="Conte o que você procura e nossa equipe ajuda a encontrar uma opção no estoque."
      />
    </Shell>
  );
}
