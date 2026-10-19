"use client";

// O Select passou a ter estado proprio, entao o arquivo inteiro vira modulo de
// cliente: quatro paginas renderizam esses campos do servidor, e hook em
// componente de servidor quebra so na hora do acesso — o build passa.
import * as React from "react";
import { cn } from "@/lib/utils";
import { SelectMenu, type SelectOption } from "./select-menu";

/**
 * Campo do painel: 40px de altura, raio interno, fundo branco.
 *
 * O fundo é a superfície do card, não uma variação cinza: o sistema separa
 * por borda, e um cinza a mais criaria um degrau de superfície que o
 * documento não prevê.
 *
 * A altura saiu dos 56px do C4MP porque o formulário de veículo tem trinta
 * campos: a 56px cada seção passava de duas telas, e a pessoa perdia de
 * vista o que já tinha preenchido. 40px é o padrão de painel denso e mantém
 * a área de clique confortável.
 */
const baseField = [
  "w-full rounded-inner border border-border bg-surface px-3.5 text-sm text-text",
  "transition-colors duration-200 ease-out",
  "hover:border-border-strong",
  "focus:border-accent focus:outline-none",
  "disabled:cursor-not-allowed disabled:opacity-60",
  "aria-[invalid=true]:border-danger",
].join(" ");

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  /**
   * Máscara de `@carbud/site-kit/masks`. Vale para campo controlado e para o
   * não-controlado dos formulários com `name`: o valor é reescrito no próprio
   * evento, antes de chegar a quem escuta — e o que veio do banco sem máscara
   * já aparece formatado.
   */
  mask?: (value: string) => string;
};

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, mask, value, defaultValue, onChange, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(baseField, "h-10", className)}
      value={mask && typeof value === "string" ? mask(value) : value}
      defaultValue={mask && typeof defaultValue === "string" ? mask(defaultValue) : defaultValue}
      onChange={
        mask
          ? (event) => {
              event.target.value = mask(event.target.value);
              onChange?.(event);
            }
          : onChange
      }
      {...props}
    />
  ),
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(baseField, "min-h-24 resize-y py-2.5", className)} {...props} />
));
Textarea.displayName = "Textarea";

/**
 * Select com lista própria, mantendo a API do nativo.
 *
 * As telas continuam escrevendo `<Select value onChange><option/></Select>` —
 * as opções são lidas dos filhos e o onChange recebe algo com `target.value`.
 * Foram dezenas de usos: trocar a assinatura significaria reescrever todos, e
 * cada reescrita é uma chance de errar um campo em silêncio.
 *
 * Modo não-controlado continua existindo porque metade dos filtros usa
 * `defaultValue` + `name` dentro de formulário por GET.
 */
type SelectProps = Omit<
  React.SelectHTMLAttributes<HTMLSelectElement>,
  "onChange" | "value" | "defaultValue"
> & {
  value?: string;
  defaultValue?: string;
  onChange?: (event: { target: { value: string; name?: string } }) => void;
};

/*
 * `<option>{plan.name} · {price}</option>` chega como array, não string — o
 * rótulo caía no value e o select de planos mostrava UUIDs.
 */
function textOf(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  return "";
}

function readOptions(children: React.ReactNode): SelectOption[] {
  const options: SelectOption[] = [];

  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;

    // <optgroup> vira separador achatado: a lista já agrupa por ordem
    if (child.type === "optgroup") {
      const group = child.props as { children?: React.ReactNode };
      options.push(...readOptions(group.children));
      return;
    }
    if (child.type !== "option") return;

    const option = child.props as {
      value?: string | number;
      children?: React.ReactNode;
      disabled?: boolean;
    };
    const value = option.value === undefined ? "" : String(option.value);
    const label = textOf(option.children) || value;

    options.push({ value, label, disabled: option.disabled });
  });

  return options;
}

export function Select({
  id,
  name,
  value,
  defaultValue,
  onChange,
  disabled,
  className,
  children,
  "aria-invalid": ariaInvalid,
}: SelectProps) {
  const options = React.useMemo(() => readOptions(children), [children]);

  const controlled = value !== undefined;
  const [internal, setInternal] = React.useState(defaultValue ?? "");
  const current = controlled ? String(value) : internal;

  /**
   * A opção de valor vazio serve de placeholder E continua na lista.
   *
   * Ela é o convite ("Escolha a marca") em uns campos e uma escolha de verdade
   * em outros ("Não informado"). Tirá-la da lista deixaria a pessoa sem como
   * voltar atrás depois de escolher — o campo viraria uma porta de mão única.
   */
  const placeholder = options.find((option) => option.value === "")?.label;

  return (
    <SelectMenu
      id={id}
      name={name}
      value={current}
      options={options}
      placeholder={placeholder ?? "Selecione"}
      disabled={disabled}
      className={className}
      aria-invalid={ariaInvalid === true || ariaInvalid === "true"}
      onSelect={(next) => {
        if (!controlled) setInternal(next);
        onChange?.({ target: { value: next, name } });
      }}
    />
  );
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("label-instrument mb-1.5 block text-text", className)} {...props} />;
}

export function FormField({
  label,
  hint,
  error,
  htmlFor,
  className,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    // rótulo → campo → hint, com 6px entre eles e 16px até o próximo campo
    <div className={cn("mb-4", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && !error ? <p className="mt-1.5 text-xs text-muted">{hint}</p> : null}
      {error ? (
        <p className="mt-1.5 text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Checkbox({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="checkbox"
      className={cn(
        "h-4 w-4 shrink-0 rounded border-border bg-surface text-accent",
        "accent-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        className,
      )}
      {...props}
    />
  );
}
