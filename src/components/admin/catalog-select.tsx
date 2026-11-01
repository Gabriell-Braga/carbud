"use client";

import { useState } from "react";
import { List } from "lucide-react";
import { Input, Select } from "@/components/ui/field";
import { Tooltip } from "@/components/ui/tooltip";

const OTHER = "__outro__";

/**
 * Escolha de catálogo com saída de emergência.
 *
 * Lista fechada é o certo aqui: marca e modelo digitados à mão viram "VW",
 * "Volkswagen" e "volks" no mesmo estoque, e o filtro do site passa a mostrar
 * três marcas onde existe uma.
 *
 * A saída fica DENTRO da lista, como "Outro (digitar)" — um caminho só. O
 * botão de lápis ao lado do campo era um segundo caminho para a mesma coisa,
 * e ocupava espaço em todos os campos para atender um caso raro.
 *
 * O valor atual sempre entra na lista, mesmo fora do catálogo. Sem isso, abrir
 * um veículo antigo e salvar apagaria o que estava lá, sem ninguém ver.
 */
export function CatalogSelect({
  id,
  value,
  options,
  onChange,
  disabled,
  loading,
  placeholder = "Escolha",
}: {
  id: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Carregando é diferente de vazio: um espera, o outro é escolha da pessoa. */
  loading?: boolean;
  placeholder?: string;
}) {
  const [typing, setTyping] = useState(false);
  const known = value && !options.includes(value) ? [value, ...options] : options;

  if (typing) {
    return (
      <div className="flex items-center gap-3">
        <Input
          id={id}
          value={value}
          disabled={disabled}
          autoFocus
          onChange={(event) => onChange(event.target.value)}
        />
        {/* mesmo peso visual do lápis que trouxe até aqui: um "lista" escrito
            solto ao lado do campo lê como sobra de rascunho */}
        <Tooltip content={"Voltar para a lista"}>
          <button
            type="button"
            aria-label="Voltar para a lista"
            onClick={() => setTyping(false)}
            className="shrink-0 text-faint transition-colors hover:text-text"
          >
            <List className="h-6 w-6" />
          </button>
        </Tooltip>
      </div>
    );
  }

  return (
    <Select
      id={id}
      value={value}
      disabled={disabled || loading}
      onChange={(event) => {
        if (event.target.value === OTHER) {
          setTyping(true);
          onChange("");
          return;
        }
        onChange(event.target.value);
      }}
    >
      <option value="">{loading ? "Carregando..." : placeholder}</option>
      {known.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
      <option value={OTHER}>Outro (digitar)</option>
    </Select>
  );
}
