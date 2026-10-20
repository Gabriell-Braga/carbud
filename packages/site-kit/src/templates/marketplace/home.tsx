import Form from "next/form";
import Link from "next/link";
import type { HomeProps, SiteLinks, StockFacets } from "../contract";
import { BODY_TYPE_LABELS } from "../../lib/catalog";
import { HelpBand, SHELL, SectionHeading, Shell } from "./chrome";
import { VehicleGrid } from "./vehicle-card";

const SIMPLES = [
  { numero: "01", title: "Estoque atualizado" },
  { numero: "02", title: "Condições transparentes" },
  { numero: "03", title: "Atendimento humano" },
  { numero: "04", title: "Troca e financiamento" },
];

export function Home({ site, links, featured, latest, facets, totalVehicles }: HomeProps) {
  const destaques = [...featured, ...latest].slice(0, 4);
  const banner = site.banners[0]?.imageUrl ?? null;
  const whatsapp = links.whatsapp(`Olá! Vim pelo site da ${site.name}.`);

  return (
    <Shell site={site} links={links}>
      {/* --------------------------------------------------- herói e busca */}
      <section className="bg-[var(--site-background)] pb-8 pt-12">
        <div className={`${SHELL} grid grid-cols-1 items-center gap-10 lg:grid-cols-2`}>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--site-primary)]">
              Encontre seu próximo carro
            </p>
            <h1
              className="mt-3 max-w-[16ch] text-[40px] font-bold leading-[1.1]"
              style={{ fontFamily: "var(--site-font-heading)" }}
            >
              Escolha com calma. Compre com confiança.
            </h1>
            <p className="mt-4 max-w-[48ch] text-[14px] leading-relaxed text-[var(--site-muted)]">
              Estoque atualizado, atendimento direto e opções de financiamento para você comparar
              antes de decidir.
            </p>
            <Link
              href={links.stock}
              className="mt-6 inline-flex rounded-[var(--site-radius)] bg-[var(--site-primary)] px-6 py-3 text-[13px] font-medium text-[var(--site-primary-foreground)] transition-colors hover:bg-[var(--site-primary-hover)]"
            >
              Ver estoque
            </Link>
          </div>

          <div className="aspect-16/10 overflow-hidden rounded-[var(--site-radius)] bg-[var(--site-border)]/40">
            {banner ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={banner} alt={site.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-[11px] uppercase tracking-[0.12em] text-[var(--site-muted)]">
                Foto / banner do estoque
              </div>
            )}
          </div>
        </div>

        <div className={`${SHELL} mt-10`}>
          <SearchPanel links={links} facets={facets} />
        </div>
      </section>

      {/* -------------------------------------------------- categorias */}
      <section className={`${SHELL} py-12`}>
        <SectionHeading title="Encontre do seu jeito" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {categorias(facets, links).map((item) => (
            <Link
              key={item.title}
              href={item.href}
              className="rounded-[var(--site-radius)] border border-[var(--site-border)] px-4 py-4 transition-colors hover:border-[var(--site-primary)]"
            >
              <p className="text-[13px] font-semibold">{item.title}</p>
              {/*
                A contagem sai das facetas do estoque REAL.
                Número inventado numa categoria vazia leva a pessoa a uma lista
                sem resultado, que é a pior primeira impressão possível.
              */}
              <p className="mt-1 text-[12px] text-[var(--site-primary)]">{item.count}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* --------------------------------------------------------- destaques */}
      {destaques.length > 0 ? (
        <section className="bg-[var(--site-background)] py-12">
          <div className={SHELL}>
            <SectionHeading
              title="Carros em destaque"
              action={
                <Link
                  href={links.stock}
                  className="text-[13px] text-[var(--site-primary)] hover:underline"
                >
                  Ver estoque completo →
                </Link>
              }
            />
            <VehicleGrid vehicles={destaques} links={links} site={site} columns={4} />
          </div>
        </section>
      ) : null}

      {/* ----------------------------------------------------------- caminhos */}
      <section className={`${SHELL} py-12`}>
        <SectionHeading title="Mais caminhos para fechar negócio" />
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <CaminhoCard
            eyebrow="Financiamento"
            title="Simule entrada, prazo e parcela antes de falar com a loja."
            cta="Simular financiamento"
            href={links.financing}
          />
          <CaminhoCard
            eyebrow="Venda seu carro"
            title="Use seu carro na negociação e receba uma avaliação."
            cta="Avaliar meu carro"
            href={links.sellCar}
          />
          <CaminhoCard
            eyebrow="Precisa de ajuda?"
            title="Fale com a equipe para encontrar um veículo no seu perfil."
            cta="Falar no WhatsApp"
            href={whatsapp ?? links.contact}
            external={Boolean(whatsapp)}
            destaque
          />
        </div>
      </section>

      {/* ------------------------------------------------------------ simples */}
      <section className="bg-[var(--site-background)] py-12">
        <div className={SHELL}>
          <SectionHeading title="Comprar carro pode ser mais simples" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {SIMPLES.map((item) => (
              <div
                key={item.numero}
                className="rounded-[var(--site-radius)] border border-[var(--site-border)] bg-[var(--site-surface)] px-5 py-5"
              >
                <p
                  className="text-[15px] font-bold text-[var(--site-primary)]"
                  style={{ fontFamily: "var(--site-font-heading)" }}
                >
                  {item.numero}
                </p>
                <p className="mt-2 text-[13px]">{item.title}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <HelpBand
        site={site}
        links={links}
        title="Não encontrou o que procurava?"
        description={`Fale com a loja e conte o que você busca. A equipe pode ajudar a encontrar opções fora da sua pesquisa${totalVehicles > 0 ? ` entre os ${totalVehicles} veículos do estoque` : ""}.`}
      />
    </Shell>
  );
}

function CaminhoCard({
  eyebrow,
  title,
  cta,
  href,
  external,
  destaque,
}: {
  eyebrow: string;
  title: string;
  cta: string;
  href: string;
  external?: boolean;
  destaque?: boolean;
}) {
  return (
    <div
      className={[
        "flex flex-col rounded-[var(--site-radius)] border p-6",
        destaque
          ? "border-[var(--site-primary)]/20 bg-[var(--site-primary)]/[0.05]"
          : "border-[var(--site-border)] bg-[var(--site-background)]",
      ].join(" ")}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--site-primary)]">
        {eyebrow}
      </p>
      <p
        className="mt-3 max-w-[32ch] text-[17px] font-semibold leading-snug"
        style={{ fontFamily: "var(--site-font-heading)" }}
      >
        {title}
      </p>
      <Link
        href={href}
        {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
        className="mt-auto pt-5 text-[13px] font-medium text-[var(--site-primary)] hover:underline"
      >
        {cta} →
      </Link>
    </div>
  );
}

/** Busca com abas, igual à do desenho: atalhos de intenção, não tipo de carro. */
function SearchPanel({ links, facets }: { links: SiteLinks; facets: StockFacets }) {
  const campo =
    "h-11 w-full rounded-[var(--site-radius)] border border-[var(--site-border)] bg-[var(--site-surface)] px-3 text-[13px] outline-none transition-colors focus:border-[var(--site-primary)]";

  return (
    <div className="rounded-[var(--site-radius)] border border-[var(--site-border)] bg-[var(--site-surface)] p-5">
      <div className="flex gap-6 border-b border-[var(--site-border)]">
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
                ? "-mb-px border-b-2 border-[var(--site-primary)] pb-2.5 text-[13px] font-medium text-[var(--site-primary)]"
                : "-mb-px border-b-2 border-transparent pb-2.5 text-[13px] text-[var(--site-muted)] transition-colors hover:text-[var(--site-text)]"
            }
          >
            {aba.label}
          </Link>
        ))}
      </div>

      <Form
        action={links.stock}
        className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto]"
      >
        <select name="marca" defaultValue="" className={campo} aria-label="Marca">
          <option value="">Todas as marcas</option>
          {facets.brands.map((item) => (
            <option key={item.brand} value={item.brand}>
              {item.brand}
            </option>
          ))}
        </select>

        <input name="modelo" placeholder="Todos os modelos" className={campo} aria-label="Modelo" />

        <select name="anoMin" defaultValue="" className={campo} aria-label="Ano">
          <option value="">Todos os anos</option>
          {anosDe(facets).map((ano) => (
            <option key={ano} value={ano}>
              A partir de {ano}
            </option>
          ))}
        </select>

        <select name="precoMax" defaultValue="" className={campo} aria-label="Preço">
          <option value="">Qualquer preço</option>
          <option value="50000">Até R$ 50 mil</option>
          <option value="80000">Até R$ 80 mil</option>
          <option value="120000">Até R$ 120 mil</option>
          <option value="180000">Até R$ 180 mil</option>
        </select>

        <button
          type="submit"
          className="h-11 rounded-[var(--site-radius)] bg-[var(--site-primary)] px-8 text-[13px] font-medium text-[var(--site-primary-foreground)] transition-colors hover:bg-[var(--site-primary-hover)]"
        >
          Buscar veículos
        </button>
      </Form>
    </div>
  );
}

/**
 * Os atalhos com a contagem REAL de cada categoria.
 *
 * O desenho mostra "84 veículos" ao lado de cada um. O número sai das facetas
 * do estoque; categoria vazia não vira atalho, porque levar a pessoa a uma
 * lista sem resultado é a pior primeira impressão possível.
 */
function categorias(facets: StockFacets, links: SiteLinks) {
  const rotulo = (quantos: number) => (quantos === 1 ? "1 veículo" : `${quantos} veículos`);

  const porCarroceria = ["suv", "sedan", "hatch", "picape"] as const;

  const itens = porCarroceria.map((tipo) => ({
    title: BODY_TYPE_LABELS[tipo],
    href: links.stockWith({ carroceria: tipo }),
    quantos: facets.counts.bodyTypes[tipo] ?? 0,
  }));

  itens.push({
    title: "Até R$ 80 mil",
    href: links.stockWith({ precoMax: 80000 }),
    quantos: facets.counts.priceUpTo["80000"] ?? 0,
  });
  itens.push({
    title: "Automáticos",
    href: links.stockWith({ cambio: "automatico" }),
    quantos: facets.counts.transmissions.automatico ?? 0,
  });

  return itens
    .filter((item) => item.quantos > 0)
    .map((item) => ({ title: item.title, href: item.href, count: rotulo(item.quantos) }));
}

function anosDe(facets: StockFacets): number[] {
  const maior = facets.yearRange.max || new Date().getFullYear();
  const menor = facets.yearRange.min || maior - 4;
  const anos: number[] = [];
  for (let ano = maior; ano >= menor && anos.length < 5; ano--) anos.push(ano);
  return anos;
}
