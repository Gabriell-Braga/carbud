"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Braces,
  ChevronDown,
  ChevronRight,
  Monitor,
  Send,
  Smartphone,
  Type,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FormField, Input, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { apiPost, apiPut, fieldErrorsFrom } from "@/lib/client/api";
import {
  EMAIL_COPY_FIELDS,
  EMAIL_COPY_LIMITS,
  EMAIL_TEMPLATE_KEYS,
  EMAIL_TEMPLATES,
  resolveCopy,
  sampleEmail,
  unknownVariables,
  type EmailCopy,
  type EmailCopyOverrides,
  type EmailTemplateKey,
  type EmailVariable,
} from "@/lib/email/templates";
import { cn } from "@/lib/utils";

type Field = keyof EmailCopy;
type View = "desktop" | "mobile" | "text";

const LABELS: Record<Field, string> = {
  subject: "Assunto",
  preheader: "Prévia na caixa de entrada",
  title: "Título",
  body: "Texto",
  button: "Botão",
  footer: "Rodapé",
};

/** O que quase todo mundo muda fica à vista; o resto, a um clique. */
const MAIN_FIELDS: Field[] = ["subject", "title", "body", "button"];
const EXTRA_FIELDS: Field[] = ["preheader", "footer"];

const GROUPS = ["Comercial", "Acesso"] as const;

function sameCopy(a: EmailCopy, b: EmailCopy): boolean {
  return EMAIL_COPY_FIELDS.every((field) => a[field].trim() === b[field].trim());
}

/**
 * Modelos de e-mail: primeiro a lista, depois um modelo por vez.
 *
 * Tudo na mesma tela — quatro modelos, seis campos, variáveis e prévia — era
 * informação demais para quem só veio trocar uma frase. A lista responde "o
 * que existe e o que já foi mexido"; o editor abre só o modelo escolhido.
 *
 * A prévia não é imitação: chama `sampleEmail`, a mesma função da amostra
 * enviada por e-mail, com o rascunho no lugar do texto gravado.
 */
export function TemplateEditor({
  overrides: initialOverrides,
  canSend,
  defaultTo,
}: {
  overrides: EmailCopyOverrides;
  canSend: boolean;
  defaultTo: string;
}) {
  const [overrides, setOverrides] = useState(initialOverrides);
  const [active, setActive] = useState<EmailTemplateKey | null>(null);

  if (active) {
    return (
      <Editor
        key={active}
        templateKey={active}
        saved={overrides[active] ?? null}
        canSend={canSend}
        defaultTo={defaultTo}
        onBack={() => setActive(null)}
        onSaved={(stored) =>
          setOverrides((current) => {
            const next = { ...current };
            if (stored) next[active] = stored;
            else delete next[active];
            return next;
          })
        }
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Modelos de mensagem</CardTitle>
        <CardDescription>O texto de cada e-mail que o produto envia.</CardDescription>
      </CardHeader>
      {GROUPS.map((group) => (
        <div key={group} className="border-b border-border last:border-b-0">
          <p className="px-5 pb-1 pt-3 text-[11px] uppercase tracking-wider text-faint">{group}</p>
          <ul>
            {EMAIL_TEMPLATE_KEYS.filter((key) => EMAIL_TEMPLATES[key].group === group).map(
              (key) => {
                const info = EMAIL_TEMPLATES[key];
                return (
                  <li key={key}>
                    <button
                      type="button"
                      onClick={() => setActive(key)}
                      className="group flex w-full items-center gap-4 px-5 py-3 text-left transition-colors hover:bg-surface-2"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-text">{info.name}</span>
                        <span className="block truncate text-xs text-muted">{info.when}</span>
                      </span>
                      {overrides[key] ? <Badge tone="info">Personalizado</Badge> : null}
                      <ChevronRight className="h-4 w-4 shrink-0 text-faint transition-colors group-hover:text-text" />
                    </button>
                  </li>
                );
              },
            )}
          </ul>
        </div>
      ))}
    </Card>
  );
}

function Editor({
  templateKey,
  saved: savedOverride,
  canSend,
  defaultTo,
  onBack,
  onSaved,
}: {
  templateKey: EmailTemplateKey;
  saved: Partial<EmailCopy> | null;
  canSend: boolean;
  defaultTo: string;
  onBack: () => void;
  onSaved: (stored: Partial<EmailCopy> | null) => void;
}) {
  const toast = useToast();
  const info = EMAIL_TEMPLATES[templateKey];
  const [saved, setSaved] = useState(() => resolveCopy(templateKey, savedOverride));
  const [draft, setDraft] = useState(saved);
  const [showExtra, setShowExtra] = useState(false);
  const [view, setView] = useState<View>("desktop");
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});

  const fieldRefs = useRef<Partial<Record<Field, HTMLInputElement | HTMLTextAreaElement | null>>>(
    {},
  );
  const lastField = useRef<Field>("body");

  const dirty = !sameCopy(draft, saved);
  const isDefault = sameCopy(draft, info.defaults);

  const errors = useMemo(() => {
    const found: Partial<Record<Field, string>> = {};
    for (const field of EMAIL_COPY_FIELDS) {
      const unknown = unknownVariables(templateKey, draft[field]);
      if (unknown.length > 0) {
        found[field] = `Variável desconhecida: ${unknown.map((name) => `{{${name}}}`).join(", ")}`;
      } else if (serverErrors[`copy.${field}`]) {
        found[field] = serverErrors[`copy.${field}`];
      }
    }
    return found;
  }, [templateKey, draft, serverErrors]);
  const hasErrors = Object.keys(errors).length > 0;

  // erro num campo recolhido não pode ficar escondido
  useEffect(() => {
    if (EXTRA_FIELDS.some((field) => errors[field])) setShowExtra(true);
  }, [errors]);

  const preview = useMemo(
    () => sampleEmail(templateKey, { panelUrl: (path) => path, userName: "Ana" }, draft),
    [templateKey, draft],
  );

  function update(field: Field, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    if (serverErrors[`copy.${field}`]) setServerErrors({});
  }

  /** Coloca a variável onde o cursor estava, no último campo tocado. */
  function insertVariable(name: string) {
    const field = lastField.current;
    const element = fieldRefs.current[field];
    const token = `{{${name}}}`;
    const value = draft[field];
    const start = element?.selectionStart ?? value.length;
    const end = element?.selectionEnd ?? value.length;
    update(field, value.slice(0, start) + token + value.slice(end));

    requestAnimationFrame(() => {
      element?.focus();
      element?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  async function save() {
    setSaving(true);
    setServerErrors({});
    const result = await apiPut<{ copy: Partial<EmailCopy> | null }>(
      "/api/super-admin/email-templates",
      { key: templateKey, copy: draft },
    );
    setSaving(false);

    if (!result.ok) {
      setServerErrors(fieldErrorsFrom(result.details));
      toast.error("Não foi possível salvar", result.error);
      return;
    }

    // o servidor apara espaços; o rascunho passa a ser o que ficou gravado
    const stored = resolveCopy(templateKey, result.data.copy);
    setSaved(stored);
    setDraft(stored);
    onSaved(result.data.copy);
    toast.success("Modelo salvo", "Vale a partir do próximo envio.");
  }

  async function sendTest() {
    setSending(true);
    const result = await apiPost("/api/super-admin/email-samples", {
      to: defaultTo,
      template: templateKey,
      copy: draft,
    });
    setSending(false);

    if (!result.ok) {
      toast.error("Não consegui enviar", result.error);
      return;
    }
    toast.success("Teste enviado", `Para ${defaultTo}, com o texto que está na tela.`);
  }

  function renderField(field: Field) {
    const id = `modelo-${field}`;
    const common = {
      id,
      value: draft[field],
      maxLength: EMAIL_COPY_LIMITS[field],
      placeholder: info.defaults[field],
      "aria-invalid": errors[field] ? true : undefined,
      onFocus: () => {
        lastField.current = field;
      },
      ref: (element: HTMLInputElement & HTMLTextAreaElement) => {
        fieldRefs.current[field] = element;
      },
    };

    return (
      <FormField
        key={field}
        label={LABELS[field]}
        htmlFor={id}
        error={errors[field]}
        hint={
          field === "body"
            ? "Linha em branco separa parágrafos; **assim** vira negrito."
            : undefined
        }
      >
        {field === "body" || field === "footer" ? (
          <Textarea
            {...common}
            rows={field === "body" ? 4 : 2}
            className={field === "footer" ? "min-h-16" : undefined}
            onChange={(event) => update(field, event.target.value)}
          />
        ) : (
          <Input {...common} onChange={(event) => update(field, event.target.value)} />
        )}
      </FormField>
    );
  }

  return (
    // sem overflow-hidden: ele prende a prévia "sticky" e corta o menu de variáveis
    <Card className="overflow-visible">
      <CardHeader className="flex items-center gap-3">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onBack}
          aria-label="Voltar aos modelos"
          title="Voltar aos modelos"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <CardTitle className="flex items-center gap-2">
            {info.name}
            {dirty ? <Badge tone="warning">Não salvo</Badge> : null}
          </CardTitle>
          <CardDescription className="truncate">{info.when}</CardDescription>
        </div>
      </CardHeader>

      <CardContent className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* campos */}
        <div className="min-w-0">
          <div className="mb-3 flex justify-end">
            <VariableMenu variables={info.variables} onPick={insertVariable} />
          </div>

          {MAIN_FIELDS.map(renderField)}

          <button
            type="button"
            onClick={() => setShowExtra((open) => !open)}
            className="flex items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-text"
            aria-expanded={showExtra}
          >
            <ChevronDown
              className={cn("h-3.5 w-3.5 transition-transform", !showExtra && "-rotate-90")}
            />
            Prévia na caixa de entrada e rodapé
          </button>
          <div className={cn("mt-4", !showExtra && "hidden")}>{EXTRA_FIELDS.map(renderField)}</div>
        </div>

        {/* prévia: acompanha a rolagem no desktop, para ver o efeito de cada campo */}
        <div className="min-w-0 lg:sticky lg:top-4 lg:self-start">
          <div className="overflow-hidden rounded-inner border border-border">
            <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text">{preview.subject}</p>
                <p className="truncate text-xs text-faint">{preview.preheader}</p>
              </div>
              <div
                className="flex shrink-0 gap-0.5"
                role="radiogroup"
                aria-label="Formato da prévia"
              >
                {(
                  [
                    { key: "desktop", label: "Computador", icon: Monitor },
                    { key: "mobile", label: "Celular", icon: Smartphone },
                    { key: "text", label: "Texto puro", icon: Type },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    role="radio"
                    aria-checked={view === option.key}
                    aria-label={option.label}
                    title={option.label}
                    onClick={() => setView(option.key)}
                    className={cn(
                      "grid h-7 w-7 place-items-center rounded-full transition-colors",
                      view === option.key ? "bg-surface-2 text-text" : "text-faint hover:text-text",
                    )}
                  >
                    <option.icon className="h-3.5 w-3.5" />
                  </button>
                ))}
              </div>
            </div>

            {view === "text" ? (
              <pre className="h-[520px] overflow-auto whitespace-pre-wrap bg-surface p-4 font-mono text-xs leading-relaxed text-text">
                {preview.text}
              </pre>
            ) : (
              <div className="bg-[#f4f4f7]">
                <iframe
                  title={`Prévia: ${info.name}`}
                  srcDoc={preview.html}
                  // sem scripts nem navegação: é só para olhar
                  sandbox=""
                  className={cn(
                    "mx-auto block h-[520px] border-0 bg-[#f4f4f7]",
                    view === "mobile" ? "w-[375px] max-w-full" : "w-full",
                  )}
                />
              </div>
            )}
          </div>
          <p className="mt-2 text-xs text-faint">{info.automatic}</p>
        </div>
      </CardContent>

      <CardFooter className="flex-wrap justify-between">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isDefault}
            onClick={() => setDraft({ ...info.defaults })}
            title="Preenche com o texto de fábrica. Só vale depois de salvar."
          >
            Voltar ao padrão
          </Button>
          {dirty ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setDraft(saved);
                setServerErrors({});
              }}
            >
              Descartar
            </Button>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          {canSend ? (
            <Button
              type="button"
              variant="secondary"
              loading={sending}
              disabled={hasErrors}
              onClick={sendTest}
              title={`Envia o rascunho para ${defaultTo}`}
            >
              <Send className="h-3.5 w-3.5" />
              Enviar teste
            </Button>
          ) : null}
          <Button type="button" loading={saving} disabled={!dirty || hasErrors} onClick={save}>
            Salvar
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}

/** Variáveis num menu: à vista, viravam uma parede de chips acima dos campos. */
function VariableMenu({
  variables,
  onPick,
}: {
  variables: EmailVariable[];
  onPick: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function close(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        // mousedown não tira o foco do campo — o cursor fica onde estava
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Braces className="h-3.5 w-3.5" />
        Inserir variável
      </Button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 w-64 overflow-hidden rounded-inner border border-border bg-surface py-1 shadow-lg"
        >
          {variables.map((variable) => (
            <button
              key={variable.key}
              type="button"
              role="menuitem"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onPick(variable.key);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-text transition-colors hover:bg-surface-2"
            >
              {variable.label}
              <code className="font-mono text-[11px] text-faint">{`{{${variable.key}}}`}</code>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
