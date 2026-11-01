"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, FormField, Input, Textarea } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { apiDelete, apiPatch, apiPost, fieldErrorsFrom, type FieldErrors } from "@/lib/client/api";
import {
  firstName,
  renderTemplate,
  TEMPLATE_VARIABLES,
  unknownVariables,
  usedVariables,
  type TemplateContext,
} from "@/lib/integrations/message-templates";
import { Tooltip } from "@/components/ui/tooltip";

export type TemplateRow = { id: string; name: string; body: string; active: boolean };

export function TemplatesPanel({
  templates,
  canWrite,
  example,
}: {
  templates: TemplateRow[];
  canWrite: boolean;
  example: TemplateContext;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<TemplateRow | null>(null);

  const context: TemplateContext = {
    ...example,
    primeiro_nome: example.nome ? firstName(example.nome) : null,
  };

  async function handleDelete(template: TemplateRow) {
    const confirmed = await confirm({
      title: "Excluir modelo",
      description: `"${template.name}" some da lista. Mensagens já enviadas continuam no histórico.`,
      confirmLabel: "Excluir modelo",
      tone: "danger",
    });
    if (!confirmed) return;

    const result = await apiDelete(`/api/admin/message-templates/${template.id}`);
    if (!result.ok) {
      toast.error("Não consegui excluir", result.error);
      return;
    }
    toast.success("Modelo excluído");
    router.refresh();
  }

  async function toggleActive(template: TemplateRow, active: boolean) {
    const result = await apiPatch(`/api/admin/message-templates/${template.id}`, { active });
    if (!result.ok) {
      toast.error("Não consegui salvar", result.error);
      return;
    }
    router.refresh();
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Modelos de WhatsApp</CardTitle>
            <CardDescription>
              O texto abaixo é como a mensagem chega ao cliente, já preenchida com um exemplo:{" "}
              <strong className="font-medium text-text">{example.nome}</strong>, interessada no{" "}
              <strong className="font-medium text-text">{example.veiculo}</strong>.
            </CardDescription>
          </div>
          {canWrite ? (
            <Button
              type="button"
              className="shrink-0"
              onClick={() => setEditing({ id: "", name: "", body: "", active: true })}
            >
              <Plus className="h-3.5 w-3.5" />
              Novo modelo
            </Button>
          ) : null}
        </CardHeader>

        {templates.length === 0 ? (
          <EmptyState title="Nenhum modelo" description="Crie o primeiro para agilizar o contato." />
        ) : (
          <ul className="divide-y divide-border">
            {templates.map((template) => (
              <TemplateItem
                key={template.id}
                template={template}
                context={context}
                canWrite={canWrite}
                onEdit={() => setEditing(template)}
                onDelete={() => handleDelete(template)}
                onToggle={(active) => void toggleActive(template, active)}
              />
            ))}
          </ul>
        )}
      </Card>

      {editing ? (
        <TemplateEditor
          template={editing}
          context={context}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}

/**
 * Um modelo na lista.
 *
 * Mostra só a prévia, que é o que a revenda precisa reconhecer de relance, e
 * resume o texto cru numa linha de variáveis usadas. Antes vinham os dois
 * parágrafos inteiros, um embaixo do outro: quatro modelos viravam oito blocos
 * de texto quase igual e não dava para saber onde olhar.
 */
function TemplateItem({
  template,
  context,
  canWrite,
  onEdit,
  onDelete,
  onToggle,
}: {
  template: TemplateRow;
  context: TemplateContext;
  canWrite: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: (active: boolean) => void;
}) {
  const preview = renderTemplate(template.body, context);
  const variables = usedVariables(template.body);

  return (
    <li className={`px-4 py-3.5 ${template.active ? "" : "opacity-60"}`}>
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-medium text-text">{template.name}</span>
          {!template.active ? <Badge tone="neutral">Inativo</Badge> : null}
        </div>

        {canWrite ? (
          <div className="flex items-center gap-1">
            <label className="mr-1 flex items-center gap-1.5 text-xs text-muted">
              <Checkbox
                checked={template.active}
                onChange={(event) => onToggle(event.target.checked)}
                aria-label={`Ativar ${template.name}`}
              />
              Ativo
            </label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onEdit}
              aria-label={`Editar ${template.name}`}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onDelete}
              aria-label={`Excluir ${template.name}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : null}
      </div>

      <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-text">{preview}</p>

      {variables.length > 0 ? (
        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-faint">
          <span>preenche</span>
          {variables.map((variable) => (
            <code key={variable} className="rounded-sm bg-surface-2 px-1.5 py-0.5 text-accent-text">
              {variable}
            </code>
          ))}
        </p>
      ) : (
        <p className="mt-2 text-xs text-faint">texto fixo, sem dados do cliente</p>
      )}
    </li>
  );
}

function TemplateEditor({
  template,
  context,
  onClose,
  onSaved,
}: {
  template: TemplateRow;
  context: TemplateContext;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const isNew = !template.id;
  const [name, setName] = useState(template.name);
  const [body, setBody] = useState(template.body);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const preview = useMemo(() => renderTemplate(body, context), [body, context]);
  const unknown = useMemo(() => unknownVariables(body), [body]);

  /** Insere no fim do texto: mexer no cursor exigiria controlar a seleção. */
  function insertVariable(key: string) {
    setBody((current) => `${current}${current.endsWith(" ") || !current ? "" : " "}{{${key}}}`);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setErrors({});

    const payload = { name: name.trim(), body: body.trim() };
    const result = isNew
      ? await apiPost("/api/admin/message-templates", payload)
      : await apiPatch(`/api/admin/message-templates/${template.id}`, payload);

    setSaving(false);

    if (!result.ok) {
      setErrors(fieldErrorsFrom(result.details));
      toast.error(isNew ? "Não consegui criar" : "Não consegui salvar", result.error);
      return;
    }
    toast.success(isNew ? "Modelo criado" : "Modelo salvo");
    onSaved();
  }

  return (
    <Dialog
      open
      size="md"
      onClose={onClose}
      title={isNew ? "Novo modelo" : `Editar ${template.name}`}
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="template-form" loading={saving}>
            {isNew ? "Criar modelo" : "Salvar"}
          </Button>
        </div>
      }
    >
      <form id="template-form" onSubmit={handleSubmit} noValidate>
        <FormField label="Nome" htmlFor="template-name" error={errors.name}>
          <Input
            id="template-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Primeiro contato"
          />
        </FormField>

        <FormField label="Mensagem" htmlFor="template-body" error={errors.body} className="mb-2">
          <Textarea
            id="template-body"
            rows={5}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Olá {{primeiro_nome}}! Vi que você se interessou pelo {{veiculo}}."
          />
        </FormField>

        {/* clicar insere no texto: digitar as chaves à mão é onde nasce o erro
            de nome que só apareceria depois, na mensagem do cliente */}
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-faint">inserir:</span>
          {TEMPLATE_VARIABLES.map((variable) => (
            <Tooltip key={variable.key} content={variable.label}>
              <button
                type="button"
                onClick={() => insertVariable(variable.key as string)}
                className="rounded-sm border border-border px-1.5 py-0.5 text-xs text-muted transition-colors hover:border-accent hover:text-accent-text"
              >
                {variable.key}
              </button>
            </Tooltip>
          ))}
        </div>

        {unknown.length > 0 ? (
          <Alert tone="warning" className="mb-4">
            Estas variáveis não existem e vão sumir do texto: {unknown.join(", ")}. Confira se
            escreveu o nome certo.
          </Alert>
        ) : null}

        <div>
          <p className="label-instrument mb-1.5 text-muted">Como o cliente vai receber</p>
          <p className="whitespace-pre-wrap rounded border border-border bg-surface-2 p-3 text-[13px] leading-relaxed text-text">
            {preview || "—"}
          </p>
        </div>
      </form>
    </Dialog>
  );
}
