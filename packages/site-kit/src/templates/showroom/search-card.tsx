import Form from "next/form";
import Link from "next/link";
import type { SiteLinks, StockFacets } from "../contract";

/**
 * Cartão de busca do Showroom.
 *
 * Aparece na home encostado no pé do herói e no topo do estoque. As abas não
 * são filtro de tipo de veículo: elas são atalhos de intenção, que é como o
 * desenho as nomeia. "Ofertas" ordena pelo menor preço, e não inventa uma
 * marcação de promoção que a revenda não cadastrou.
 *
 * É um formulário GET, então a busca vira URL: dá para compartilhar o
 * resultado, voltar para ele e indexá-lo.
 */
export function SearchCard({
  links,
  facets,
  activeTab = "todos",
  className = "",
}: {
  links: SiteLinks;
  facets: StockFacets;
  activeTab?: "todos" | "seminovos" | "ofertas";
  className?: string;
}) {
  const abas = [
    { id: "todos" as const, label: "Todos", href: links.stock },
    { id: "seminovos" as const, label: "Seminovos", href: links.stockWith({ ordem: "km-asc" }) },
    { id: "ofertas" as const, label: "Ofertas", href: links.stockWith({ ordem: "preco-asc" }) },
  ];

  const campo =
    "h-11 w-full rounded-[var(--site-radius)] border border-[var(--site-border)] bg-[var(--site-surface)] px-3 text-[13px] text-[var(--site-text)] outline-none transition-colors focus:border-[var(--site-primary)]";

  return (
    <div
      className={`rounded-[var(--site-radius)] bg-[var(--site-surface)] p-5 shadow-[0_18px_48px_-24px_rgba(12,20,36,0.35)] ${className}`}
    >
      <div className="flex gap-6 border-b border-[var(--site-border)]">
        {abas.map((aba) => (
          <Link
            key={aba.id}
            href={aba.href}
            className={[
              "-mb-px border-b-2 pb-2.5 text-[13px] transition-colors",
              aba.id === activeTab
                ? "border-[var(--site-primary)] font-medium text-[var(--site-text)]"
                : "border-transparent text-[var(--site-muted)] hover:text-[var(--site-text)]",
            ].join(" ")}
          >
            {aba.label}
          </Link>
        ))}
      </div>

      <Form action={links.stock} className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
        <select name="marca" defaultValue="" className={campo} aria-label="Marca">
          <option value="">Todas as marcas</option>
          {facets.brands.map((item) => (
            <option key={item.brand} value={item.brand}>
              {item.brand}
            </option>
          ))}
        </select>

        {/*
          Modelo é campo de texto, e não lista.
          A lista de modelos depende da marca escolhida, e montá-la exigiria
          uma ida ao servidor a cada troca — no cartão de busca isso troca uma
          espera por uma comodidade que a busca por texto já resolve.
        */}
        <input
          name="modelo"
          placeholder="Todos os modelos"
          className={campo}
          aria-label="Modelo"
        />

        <select name="anoMin" defaultValue="" className={campo} aria-label="Ano mínimo">
          <option value="">Todos os anos</option>
          {anosDe(facets).map((ano) => (
            <option key={ano} value={ano}>
              A partir de {ano}
            </option>
          ))}
        </select>

        <select name="precoMax" defaultValue="" className={campo} aria-label="Preço máximo">
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
          Buscar
        </button>
      </Form>
    </div>
  );
}

/**
 * Cinco anos, do mais novo para trás.
 *
 * A lista sai do estoque real: oferecer "a partir de 2015" numa loja cujo
 * carro mais antigo é de 2020 produz filtro que nunca muda o resultado.
 */
function anosDe(facets: StockFacets): number[] {
  const maior = facets.yearRange.max || new Date().getFullYear();
  const menor = facets.yearRange.min || maior - 4;
  const anos: number[] = [];
  for (let ano = maior; ano >= menor && anos.length < 5; ano--) anos.push(ano);
  return anos;
}
