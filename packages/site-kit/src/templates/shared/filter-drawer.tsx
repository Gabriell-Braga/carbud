"use client";

import { useEffect, useId, useRef, useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import type { AppliedFilters } from "../contract";
import { FILTERS_APPLIED } from "./filter-form";

/**
 * Quantos filtros estão aplicados, fora a ordenação.
 *
 * Vai no botão "Filtrar" da barra: com o painel fechado, é o único sinal de
 * que a lista está filtrada.
 */
export function countActiveFilters(filters: AppliedFilters): number {
  return Object.entries(filters).filter(
    ([key, value]) => key !== "sort" && value !== undefined && value !== "",
  ).length;
}

/**
 * Filtros do estoque no celular: uma barra que fica presa no topo enquanto
 * a lista rola, com o botão "Filtrar" e a ordenação; o formulário abre num
 * painel por cima da página.
 *
 * Antes, o formulário inteiro vinha ANTES da lista em telas pequenas — a
 * pessoa rolava uma tela de campos para ver o primeiro carro, e ao chegar no
 * décimo já não tinha como mudar um filtro sem voltar tudo. É o desenho dos
 * grandes classificados, e é o que o Figma pede.
 *
 * O formulário é UM só, o mesmo do desktop: quem decide onde ele aparece é
 * a classe. Em telas grandes ele fica no lugar de sempre (coluna ou faixa);
 * no celular ele vira o painel. Se fossem dois, os ids dos campos
 * duplicariam e o segundo enviaria valores diferentes do primeiro.
 *
 * A barra é `sticky`, então ela precisa ser filha direta de algo que se
 * estenda pela lista inteira (o grid da página, não uma coluna) — presa
 * dentro de uma coluna pequena, ela pararia de acompanhar no fim da coluna.
 */
export function FilterDrawer({
  filters,
  sort,
  barClassName = "",
  panelClassName = "lg:static",
  children,
}: {
  filters: AppliedFilters;
  /** O controle de ordenação, que fica ao lado do botão na barra. */
  sort?: React.ReactNode;
  /** Distância do topo (por causa do cabeçalho de cada template) e sangria lateral. */
  barClassName?: string;
  /**
   * Como o painel se posiciona no desktop: precisa trazer a posição em `lg:`
   * (`lg:static`, ou `lg:sticky lg:top-…` para a coluna presa), porque no
   * celular aberto ele é `fixed` e alguém tem que desfazer isso.
   */
  panelClassName?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const count = countActiveFilters(filters);

  /*
    * Aplicar fecha o painel.
    *
    * Antes quem fechava era o recarregamento da página, que remontava tudo.
    * Agora a lista troca sem recarregar — sem isto o painel ficaria aberto
    * por cima do resultado que a pessoa acabou de pedir para ver.
    */
  useEffect(() => {
    const close = () => setOpen(false);
    window.addEventListener(FILTERS_APPLIED, close);
    return () => window.removeEventListener(FILTERS_APPLIED, close);
  }, []);

  useEffect(() => {
    if (!open) return;

    const opener = trigger.current;

    // a página atrás não rola junto com o painel
    const previous = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    closeButton.current?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);

    return () => {
      document.documentElement.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, [open]);

  return (
    <>
      <div
        className={`sticky z-20 border-b border-[var(--site-border)] bg-[var(--site-surface)] px-4 py-2.5 lg:hidden ${barClassName}`}
      >
        <div className="flex items-center gap-2">
          <button
            ref={trigger}
            type="button"
            onClick={() => setOpen(true)}
            aria-expanded={open}
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-[var(--site-radius)] border border-[var(--site-border)] bg-[var(--site-surface)] px-4 text-sm font-medium text-[var(--site-text)] transition-colors hover:border-[var(--site-primary)]"
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            Filtrar
            {count > 0 ? (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--site-primary)] px-1.5 text-[11px] font-semibold text-[var(--site-primary-foreground)]">
                {count}
                <span className="sr-only"> filtros aplicados</span>
              </span>
            ) : null}
          </button>
          {sort ? (
            <div className="min-w-0 flex-1 [&_form]:flex [&_form]:items-center [&_form]:gap-2 [&_select]:h-11 [&_select]:w-full [&_select]:min-w-0">
              {sort}
            </div>
          ) : null}
        </div>
      </div>

      <div
        role={open ? "dialog" : undefined}
        aria-modal={open ? true : undefined}
        aria-labelledby={open ? titleId : undefined}
        className={
          open
            ? `fixed inset-0 z-50 flex flex-col bg-[var(--site-background)] lg:inset-auto lg:z-auto lg:block lg:bg-transparent ${panelClassName}`
            : `hidden lg:block ${panelClassName}`
        }
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--site-border)] bg-[var(--site-surface)] px-4 py-3 lg:hidden">
          <p
            id={titleId}
            className="text-base font-semibold text-[var(--site-text)]"
            style={{ fontFamily: "var(--site-font-heading)" }}
          >
            Filtros
          </p>
          <button
            ref={closeButton}
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Fechar filtros"
            className="grid h-10 w-10 place-items-center rounded-full text-[var(--site-text)] transition-colors hover:bg-[var(--site-border)]"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* no celular o formulário rola dentro do painel; no desktop ele fica
            no fluxo da página, como sempre esteve */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-8 lg:overflow-visible lg:p-0">
          {children}
        </div>
      </div>
    </>
  );
}
