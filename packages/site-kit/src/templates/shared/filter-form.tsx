"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";

/**
 * O formulário de filtros, com comportamento diferente por tamanho de tela.
 *
 * **No desktop o filtro aplica sozinho.** A coluna de filtros está do lado da
 * lista: mexer num campo e ver o resultado mudar é o que a pessoa espera, e é
 * o que os grandes classificados fazem. O botão "Aplicar" ali vira um passo
 * que só existe para ser esquecido — quem escolhe a marca e não clica conclui
 * que o site não filtra.
 *
 * **No celular o botão fica.** Lá os filtros abrem numa tela por cima da
 * lista (ver `FilterDrawer`): aplicar a cada campo fecharia o painel e jogaria
 * a pessoa de volta na lista antes de ela terminar de escolher. O botão é o
 * que diz "terminei".
 *
 * O envio acompanha o evento `change` do DOM, não o `onChange` do React — no
 * React, `onChange` de campo de texto dispara a cada tecla, e a busca
 * recarregaria a página sete vezes enquanto alguém digita "Corolla". O
 * `change` nativo só dispara quando o campo perde o foco ou a pessoa aperta
 * Enter; em `<select>`, na hora da escolha, que é o que se quer.
 */

const AutoFilterContext = createContext(false);

/** Ponto de corte do desktop: o mesmo `lg` do Tailwind usado nos templates. */
const DESKTOP = "(min-width: 1024px)";

export function FilterForm({
  action,
  className,
  children,
}: {
  action: string;
  className?: string;
  children: React.ReactNode;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  /*
   * Só depois de montar: sem JavaScript o botão continua visível e o
   * formulário segue funcionando como sempre funcionou. Esconder o botão no
   * CSS puro deixaria quem está sem JS sem nenhuma forma de filtrar.
   */
  const [autoReady, setAutoReady] = useState(false);

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;

    const apply = () => {
      // no celular quem manda é o botão: ver o comentário do topo
      if (!window.matchMedia(DESKTOP).matches) return;
      form.requestSubmit();
    };

    form.addEventListener("change", apply);
    setAutoReady(true);
    return () => form.removeEventListener("change", apply);
  }, []);

  return (
    <AutoFilterContext.Provider value={autoReady}>
      <form ref={formRef} action={action} method="get" className={className}>
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
