"use client";

import { useId } from "react";

/**
 * Select que aplica a escolha na hora, sem botao.
 *
 * Ordenacao com botao "Ordenar" ao lado nao existe em lugar nenhum: a pessoa
 * escolhe "menor preco", olha a lista, e ela continua igual — o que parece
 * defeito, nao passo faltando.
 *
 * Sem JavaScript o botao dentro do <noscript> continua ali, entao a pagina
 * funciona igual. E o unico caso em que ele precisa existir.
 */
export function AutoSubmitSelect({
  name,
  label,
  value,
  options,
  className,
  submitLabel = "Aplicar",
}: {
  name: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  className?: string;
  submitLabel?: string;
}) {
  const id = useId();

  return (
    <>
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        name={name}
        defaultValue={value}
        className={className}
        /* o `FilterForm` pula quem ja se envia: sem isto a mesma escolha
           entraria duas vezes no historico do navegador */
        data-self-submit="true"
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <noscript>
        <button
          type="submit"
          className="rounded-lg border border-[var(--site-border)] px-3 py-2.5 text-sm text-[var(--site-text)]"
        >
          {submitLabel}
        </button>
      </noscript>
    </>
  );
}
