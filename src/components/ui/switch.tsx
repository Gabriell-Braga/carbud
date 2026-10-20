"use client";

import { cn } from "@/lib/utils";

/**
 * Liga/desliga de uma opção que muda o comportamento na hora (diferente do
 * checkbox, que marca itens de uma lista). É um botão com role="switch": o
 * leitor de tela anuncia "ligado"/"desligado" e Espaço/Enter alternam.
 */
export function Switch({
  checked,
  onChange,
  disabled,
  id,
  "aria-labelledby": labelledBy,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  "aria-labelledby"?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-labelledby={labelledBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        "disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-accent" : "bg-surface-2 ring-1 ring-inset ring-border",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "inline-block h-5 w-5 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-5.5" : "translate-x-0.5",
        )}
      />
    </button>
  );
}
