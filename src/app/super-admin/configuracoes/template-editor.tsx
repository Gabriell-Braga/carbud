"use client";

import { useMemo, useRef, useState } from "react";
import { Info, Monitor, RotateCcw, Send, Smartphone, Type } from "lucide-react";
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
import { APP_NAME } from "@/lib/brand";
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

const HINTS: Partial<Record<Field, string>> = {
  preheader: "Aparece ao lado do assunto, na lista de mensagens.",
  body: "Linha em branco separa parágrafos. **Assim** vira negrito.",
};

function sameCopy(a: EmailCopy, b: EmailCopy): boolean {
  return EMAIL_COPY_FIELDS.every((field) => a[field].trim() === b[field].trim());
}

/**
 * Editor dos textos de e-mail, com prévia montada pelo mesmo código do envio.
 *
 * A prévia não é uma imitação: chama `sampleEmail`, a mesma função que monta
 * a amostra enviada por e-mail, com o rascunho no lugar do texto gravado. O
 * que aparece aqui é o que sai — só o cliente de e-mail pode mudar algo.
 *
 * Cada modelo guarda o próprio rascunho enquanto a pessoa navega entre eles,
 * então trocar de modelo não pede confirmação nem perde o que foi escrito; o
 * ponto no cartão avisa o que ainda não foi salvo.
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
  const toast = useToast();
  const [overrides, setOverrides] = useState(initialOverrides);
  const [active, setActive] = useState<EmailTemplateKey>(EMAIL_TEMPLATE_KEYS[0]);
  const [drafts, setDrafts] = useState<Record<EmailTemplateKey, EmailCopy>>(
    () =>
      Object.fromEntries(
        EMAIL_TEMPLATE_KEYS.map((key) => [key, resolveCopy(key, initialOverrides[key])]),
      ) as Record<EmailTemplateKey, EmailCopy>,
  );
  const [view, setView] = useState<View>("desktop");
  const [to, setTo] = useState(defaultTo);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});

  const fieldRefs = useRef<Partial<Record<Field, HTMLInputElement | HTMLTextAreaElement | null>>>(
    {},
  );
  const lastField = useRef<Field>("body");

  const info = EMAIL_TEMPLATES[active];
  const draft = drafts[active];
  const saved = resolveCopy(active, overrides[active]);
  const dirty = !sameCopy(draft, saved);
  const isDefault = sameCopy(draft, info.defaults);

  const errors = useMemo(() => {
    const found: Partial<Record<Field, string>> = {};
    for (const field of EMAIL_COPY_FIELDS) {
      const unknown = unknownVariables(active, draft[field]);
      if (unknown.length > 0) {
        found[field] = `Variável desconhecida: ${unknown.map((name) => `{{${name}}}`).join(", ")}`;
      } else if (serverErrors[`copy.${field}`]) {
        found[field] = serverErrors[`copy.${field}`];
      }
    }
    return found;
  }, [active, draft, serverErrors]);
  const hasErrors = Object.keys(errors).length > 0;

  const preview = useMemo(
    () => sampleEmail(active, { panelUrl: (path) => path, userName: "Ana" }, draft),
    [active, draft],
  );

  function update(field: Field, value: string) {
    setDrafts((current) => ({ ...current, [active]: { ...current[active], [field]: value } }));
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
      { key: active, copy: draft },
    );
    setSaving(false);

    if (!result.ok) {
      setServerErrors(fieldErrorsFrom(result.details));
      toast.error("Não foi possível salvar", result.error);
      return;
    }

    const stored = result.data.copy;
    setOverrides((current) => {
      const next = { ...current };
      if (stored) next[active] = stored;
      else delete next[active];
      return next;
    });
    // o servidor apara espaços; o rascunho passa a ser o que ficou gravado
    setDrafts((current) => ({ ...current, [active]: resolveCopy(active, stored) }));
    toast.success("Modelo salvo", `“${info.name}” vale a partir do próximo envio.`);
  }

  async function sendTest() {
    setSending(true);
    const result = await apiPost("/api/super-admin/email-samples", {
      to,
      template: active,
      copy: draft,
    });
    setSending(false);

    if (!result.ok) {
      toast.error("Não consegui enviar", result.error);
      return;
    }
    toast.success("Teste enviado", `“${info.name}” para ${to}, com o texto que está na tela.`);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Modelos de mensagem</CardTitle>
        <CardDescription>
          Os textos de cada e-mail. O desenho e os dados de cada envio — telefone, mensagem do
          cliente, links — entram sozinhos; aqui muda só o que está escrito.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="grid grid-cols-2 gap-2 xl:grid-cols-4" role="tablist">
          {EMAIL_TEMPLATE_KEYS.map((key) => {
            const item = EMAIL_TEMPLATES[key];
            const selected = key === active;
            const custom = Boolean(overrides[key]);
            const unsaved = !sameCopy(drafts[key], resolveCopy(key, overrides[key]));
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => {
                  setActive(key);
                  setServerErrors({});
                }}
                className={cn(
                  "rounded-inner border px-3.5 py-3 text-left transition-colors duration-200 ease-out",
                  selected
                    ? "border-accent bg-accent-soft"
                    : "border-border bg-surface hover:border-border-strong",
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-[11px] uppercase tracking-wider text-faint">
                    {item.group}
                  </span>
                  {unsaved ? (
                    <span
                      className="h-2 w-2 rounded-full bg-warning"
                      title="Alterações não salvas"
                      aria-label="Alterações não salvas"
                    />
                  ) : null}
                </span>
                <span className="mt-0.5 block text-sm font-medium text-text">{item.name}</span>
                <span className="mt-1 block text-xs text-muted">
                  {custom ? "Personalizado" : "Texto padrão"}
                </span>
              </button>
            );
          })}
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          {/* campos */}
          <div className="min-w-0">
            <p className="mb-4 text-xs leading-relaxed text-muted">{info.when}</p>

            <div className="mb-4">
              <p className="label-instrument mb-1.5 text-text">Variáveis</p>
              <div className="flex flex-wrap gap-1.5">
                {info.variables.map((variable) => (
                  <button
                    key={variable.key}
                    type="button"
                    // mousedown não tira o foco do campo — o cursor fica onde estava
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => insertVariable(variable.key)}
                    title={`Inserir ${variable.label.toLowerCase()} no campo selecionado`}
                    className="inline-flex items-center gap-1.5 rounded-tag border border-border bg-surface-2 px-2 py-1 text-xs text-muted transition-colors hover:border-accent hover:text-text"
                  >
                    <code className="font-mono text-[11px] text-accent-text">{`{{${variable.key}}}`}</code>
                    {variable.label}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-faint">
                Clique para inserir no campo onde está o cursor.
              </p>
            </div>

            {EMAIL_COPY_FIELDS.map((field) => {
              const multiline = field === "body" || field === "footer";
              const props = {
                id: `modelo-${field}`,
                value: draft[field],
                maxLength: EMAIL_COPY_LIMITS[field],
                placeholder: info.defaults[field],
                "aria-invalid": errors[field] ? true : undefined,
                onFocus: () => {
                  lastField.current = field;
                },
                onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                  update(field, event.target.value),
              };
              const hint =
                field === "subject"
                  ? `${draft.subject.length} caracteres — até uns 60 aparecem inteiros no celular.`
                  : HINTS[field];

              return (
                <FormField
                  key={field}
                  label={LABELS[field]}
                  htmlFor={props.id}
                  hint={hint}
                  error={errors[field]}
                >
                  {multiline ? (
                    <Textarea
                      {...props}
                      ref={(element) => {
                        fieldRefs.current[field] = element;
                      }}
                      rows={field === "body" ? 5 : 2}
                      className={field === "footer" ? "min-h-16" : undefined}
                    />
                  ) : (
                    <Input
                      {...props}
                      ref={(element) => {
                        fieldRefs.current[field] = element;
                      }}
                    />
                  )}
                </FormField>
              );
            })}

            <div className="flex items-start gap-2 rounded-inner border border-border bg-surface-2 px-3.5 py-3 text-xs leading-relaxed text-muted">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                <span className="font-medium text-text">Entra sozinho: </span>
                {info.automatic}
              </span>
            </div>
          </div>

          {/* prévia: acompanha a rolagem no desktop, para ver o efeito de cada campo */}
          <div className="min-w-0 lg:sticky lg:top-4 lg:self-start">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="label-instrument text-text">Prévia</p>
              <div
                className="inline-flex rounded-full border border-border bg-surface-2 p-0.5"
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
                    title={option.label}
                    onClick={() => setView(option.key)}
                    className={cn(
                      "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs transition-colors",
                      view === option.key
                        ? "bg-surface text-text shadow-sm"
                        : "text-muted hover:text-text",
                    )}
                  >
                    <option.icon className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{option.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-hidden rounded-inner border border-border">
              {/* como aparece na lista da caixa de entrada */}
              <div className="flex items-start gap-3 border-b border-border bg-surface px-4 py-3">
                <span
                  aria-hidden="true"
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-contrast"
                >
                  {APP_NAME.charAt(0)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted">{APP_NAME}</p>
                  <p className="truncate text-sm font-semibold text-text">{preview.subject}</p>
                  <p className="truncate text-xs text-faint">{preview.preheader}</p>
                </div>
              </div>

              <div className="bg-[#f4f4f7]">
                {view === "text" ? (
                  <pre className="h-[560px] overflow-auto whitespace-pre-wrap bg-surface p-4 font-mono text-xs leading-relaxed text-text">
                    {preview.text}
                  </pre>
                ) : (
                  <iframe
                    title={`Prévia: ${info.name}`}
                    srcDoc={preview.html}
                    // sem scripts nem navegação: é só para olhar
                    sandbox=""
                    className={cn(
                      "mx-auto block h-[560px] border-0 bg-[#f4f4f7] transition-[width] duration-300",
                      view === "mobile" ? "w-[375px] max-w-full" : "w-full",
                    )}
                  />
                )}
              </div>
            </div>

            <p className="mt-2 text-xs text-faint">
              Com dados de exemplo. Gmail e Outlook podem mudar detalhes — envie um teste para ver
              na caixa de entrada.
            </p>

            {canSend ? (
              <div className="mt-4 flex flex-wrap items-end gap-2">
                <FormField
                  label="Enviar teste para"
                  htmlFor="modelo-teste-para"
                  className="mb-0 min-w-52 flex-1"
                >
                  <Input
                    id="modelo-teste-para"
                    type="email"
                    value={to}
                    onChange={(event) => setTo(event.target.value)}
                  />
                </FormField>
                <Button
                  type="button"
                  variant="secondary"
                  loading={sending}
                  disabled={hasErrors || !to}
                  onClick={sendTest}
                >
                  <Send className="h-3.5 w-3.5" />
                  Enviar teste
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </CardContent>

      <CardFooter className="flex-wrap justify-between">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isDefault}
            onClick={() => setDrafts((current) => ({ ...current, [active]: { ...info.defaults } }))}
            title="Preenche os campos com o texto de fábrica. Só vale depois de salvar."
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Texto padrão
          </Button>
          {dirty ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setDrafts((current) => ({ ...current, [active]: saved }));
                setServerErrors({});
              }}
            >
              Descartar
            </Button>
          ) : null}
        </div>

        <div className="flex items-center gap-3">
          {dirty ? <Badge tone="warning">Não salvo</Badge> : null}
          <Button type="button" loading={saving} disabled={!dirty || hasErrors} onClick={save}>
            Salvar modelo
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
