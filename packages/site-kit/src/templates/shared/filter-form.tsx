"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState, useTransition } from "react";

/**
 * O formulário de filtros: aplica sem recarregar a página, e a URL continua
 * contando o que está filtrado.
 *
 * **Por que não é um envio de formulário comum.** Enviar recarrega a página
 * inteira: a tela pisca, o navegador volta para o topo e quem estava no meio
 * da lista perde o lugar. Em filtro isso é fatal, porque filtrar é uma coisa
 * que a pessoa faz cinco, seis vezes seguidas — cada refinamento cobrava um
 * recarregamento e a perda do ponto onde ela estava.
 *
 * Aqui o envio vira `router.push` com `scroll: false`: o servidor manda só a
 * lista nova, o React troca o conteúdo no lugar e a rolagem fica onde estava.
 * A URL muda igual (`?marca=Jeep&cambio=automatico`), então continua dando
 * para mandar no WhatsApp, favoritar e voltar pelo botão do navegador.
 *
 * **Sem JavaScript continua funcionando**: o `<form>` mantém `action` e
 * `method`, e o envio nativo faz o que sempre fez.
 *
 * **No desktop aplica sozinho; no celular tem botão.** No desktop a coluna de
 * filtros está do lado da lista, e ver o resultado mudar é o que a pessoa
 * espera. No celular os filtros abrem numa tela por cima da lista (ver
 * `FilterDrawer`): aplicar a cada campo fecharia o painel antes de ela
 * terminar de escolher.
 *
 * O disparo automático acompanha o evento `change` do DOM, e não o `onChange`
 * do React — no React, `onChange` de campo de texto dispara a cada tecla, e a
 * busca recarregaria a lista sete vezes enquanto alguém digita "Corolla". O
 * `change` nativo só dispara quando o campo perde o foco ou a pessoa aperta
 * Enter; em `<select>`, na hora da escolha.
 */

const AutoFilterContext = createContext(false);

/** Ponto de corte do desktop: o mesmo `lg` do Tailwind usado nos templates. */
const DESKTOP = "(min-width: 1024px)";

/**
 * Avisa que os filtros foram aplicados.
 *
 * O painel do celular precisa se fechar quando isso acontece, e ele não é
 * pai nem filho do formulário — antes, quem fechava era o recarregamento da
 * página, que remontava tudo. Um evento na janela liga os dois sem obrigar
 * cada template a passar uma função de um lado para o outro.
 */
export const FILTERS_APPLIED = "carbud:filters-applied";

export function FilterForm({
  action,
  className,
  children,
}: {
  action: string;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  /*
   * Só depois de montar: sem JavaScript o botão continua visível e o
   * formulário segue funcionando como sempre funcionou. Esconder o botão no
   * CSS puro deixaria quem está sem JS sem nenhuma forma de filtrar.
   */
  const [autoReady, setAutoReady] = useState(false);

  function apply(form: HTMLFormElement) {
    const params = new URLSearchParams();
    for (const [name, value] of new FormData(form).entries()) {
      const text = String(value).trim();
      // campo vazio não entra: "?marca=&modelo=&anoMin=" é lixo na URL que a
      // pessoa vê, copia e manda para alguém
      if (text) params.set(name, text);
    }

    const query = params.toString();
    startTransition(() => {
      // `scroll: false` é o ponto: sem isso a lista nova chegaria com a
      // página de volta no topo, que é metade do incômodo do recarregamento
      router.push(query ? `${action}?${query}` : action, { scroll: false });
    });

    window.dispatchEvent(new CustomEvent(FILTERS_APPLIED));
  }

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;

    const onChange = (event: Event) => {
      // no celular quem manda é o botão: ver o comentário do topo
      if (!window.matchMedia(DESKTOP).matches) return;
      /*
       * O select de ordenação já se envia sozinho (ver `AutoSubmitSelect`).
       * Sem esta saída, a mesma escolha entraria duas vezes no histórico do
       * navegador, e voltar uma página não voltaria nada.
       */
      if ((event.target as HTMLElement | null)?.dataset?.selfSubmit === "true") return;
      form.requestSubmit();
    };

    form.addEventListener("change", onChange);
    setAutoReady(true);
    return () => form.removeEventListener("change", onChange);
  }, []);

  return (
    <AutoFilterContext.Provider value={autoReady}>
      <form
        ref={formRef}
        action={action}
        method="get"
        className={className}
        aria-busy={pending}
        onSubmit={(event) => {
          event.preventDefault();
          apply(event.currentTarget);
        }}
      >
        {/*
          Uma faixa fina no topo enquanto a lista nova não chega.
          Sem o recarregamento, o navegador não mostra mais nenhum sinal de
          que algo está acontecendo — e numa conexão ruim a troca silenciosa
          de conteúdo parece travamento.
        */}
        {pending ? (
          <span
            aria-hidden="true"
            className="fixed inset-x-0 top-0 z-[60] h-0.5 animate-pulse bg-[var(--site-primary)]"
          />
        ) : null}
        {children}
      </form>
    </AutoFilterContext.Provider>
  );
}

/**
 * O botão de aplicar: some no desktop quando o envio automático está de pé.
 *
 * Fica aqui, e não em cada template, porque a regra é uma só — e porque a
 * condição ("o JavaScript montou") não dá para escrever em classe estática.
 */
export function FilterSubmit({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const autoReady = useContext(AutoFilterContext);

  return (
    <button type="submit" className={`${className ?? ""} ${autoReady ? "lg:hidden" : ""}`.trim()}>
      {children}
    </button>
  );
}
