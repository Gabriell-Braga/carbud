"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Plus, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, FormField, Input } from "@/components/ui/field";
import { EmptyState, Table, Td, Th, Thead, Tr } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { TENANT_WEBHOOK_EVENTS } from "@/db/schema";
import { WEBHOOK_HEADER_SIGNATURE } from "@/lib/brand";
import { apiDelete, apiPatch, apiPost } from "@/lib/client/api";
import { formatDateTime } from "@/lib/utils";

type KeyRow = {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

type WebhookRow = {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  lastStatus: number | null;
  lastError: string | null;
  lastAttemptAt: string | null;
  failureCount: number;
};

const EVENT_LABELS: Record<string, string> = {
  "lead.created": "Lead recebido",
  "lead.updated": "Lead atualizado",
  "vehicle.created": "Veículo cadastrado",
  "vehicle.updated": "Veículo alterado",
  "vehicle.sold": "Veículo vendido",
};

export function IntegrationsPanel({
  keys,
  webhooks,
  tenantSlug,
  showFeed,
  section,
}: {
  keys: KeyRow[];
  webhooks: WebhookRow[];
  tenantSlug: string;
  showFeed: boolean;
  /**
   * Qual aba está aberta.
   *
   * O painel continua UM componente porque os diálogos, o aviso do segredo
   * recém-criado e o "copiar" são compartilhados — separar em três arquivos
   * duplicaria esse estado. Quem decide o que aparece é esta prop.
   */
  section: "chaves" | "webhooks" | "feed";
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();

  const [creatingKey, setCreatingKey] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [editingHook, setEditingHook] = useState<WebhookRow | null>(null);
  const [freshSecret, setFreshSecret] = useState<string | null>(null);

  async function handleCreateKey() {
    if (keyName.trim().length < 2) {
      toast.error("Dê um nome para reconhecer a chave");
      return;
    }
    setBusy(true);
    const result = await apiPost<{ key: string }>("/api/admin/api-keys", { name: keyName.trim() });
    setBusy(false);

    if (!result.ok) {
      toast.error("Não consegui criar", result.error);
      return;
    }
    setFreshKey(result.data.key);
    setKeyName("");
    setCreatingKey(false);
    router.refresh();
  }

  async function handleRevoke(key: KeyRow) {
    const confirmed = await confirm({
      title: "Revogar chave",
      description: `"${key.name}" para de funcionar imediatamente. Qualquer sistema que a use perde o acesso.`,
      confirmLabel: "Revogar chave",
      tone: "danger",
    });
    if (!confirmed) return;

    const result = await apiDelete(`/api/admin/api-keys/${key.id}`);
    if (!result.ok) {
      toast.error("Não consegui revogar", result.error);
      return;
    }
    toast.success("Chave revogada");
    router.refresh();
  }

  async function handleDeleteHook(hook: WebhookRow) {
    const confirmed = await confirm({
      title: "Remover webhook",
      description: `Paramos de avisar ${hook.url}.`,
      confirmLabel: "Remover webhook",
      tone: "danger",
    });
    if (!confirmed) return;

    const result = await apiDelete(`/api/admin/webhooks/${hook.id}`);
    if (!result.ok) {
      toast.error("Não consegui remover", result.error);
      return;
    }
    toast.success("Webhook removido");
    router.refresh();
  }

  async function copy(value: string, what: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${what} copiado`);
    } catch {
      toast.error("Não consegui copiar", "Selecione o texto e copie manualmente.");
    }
  }

  return (
    <>
      {freshKey ? (
        <Alert tone="warning" className="mb-4">
          <p className="mb-2 font-medium">
            Guarde esta chave agora: ela não será mostrada de novo.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="break-all rounded-sm bg-surface-2 px-2 py-1 text-xs">{freshKey}</code>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => copy(freshKey, "Chave")}
            >
              <Copy className="h-3.5 w-3.5" />
              Copiar
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setFreshKey(null)}>
              Já guardei
            </Button>
          </div>
        </Alert>
      ) : null}

      {freshSecret ? (
        <Alert tone="warning" className="mb-4">
          <p className="mb-2 font-medium">
            Segredo do webhook. Use para conferir a assinatura das chamadas. Não será mostrado de
            novo.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="break-all rounded-sm bg-surface-2 px-2 py-1 text-xs">
              {freshSecret}
            </code>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => copy(freshSecret, "Segredo")}
            >
              <Copy className="h-3.5 w-3.5" />
              Copiar
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setFreshSecret(null)}>
              Já guardei
            </Button>
          </div>
        </Alert>
      ) : null}

      {section === "chaves" ? (
        <Card className="mb-4">
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>Chaves de API</CardTitle>
              <CardDescription>
                Envie em <code className="text-xs">Authorization: Bearer</code> para ler seu estoque
                e seus leads. Guardamos apenas o hash: a chave em claro aparece uma única vez.
              </CardDescription>
            </div>
            <Button type="button" className="shrink-0" onClick={() => setCreatingKey(true)}>
              <Plus className="h-3.5 w-3.5" />
              Nova chave
            </Button>
          </CardHeader>

          {keys.length === 0 ? (
            <EmptyState title="Nenhuma chave" description="Crie uma para conectar outro sistema." />
          ) : (
            <Table>
              <Thead>
                <Tr>
                  <Th>Nome</Th>
                  <Th>Início</Th>
                  <Th numeric>Último uso</Th>
                  <Th>Situação</Th>
                  <Th />
                </Tr>
              </Thead>
              <tbody>
                {keys.map((key) => (
                  <Tr key={key.id}>
                    <Td>{key.name}</Td>
                    <Td>
                      <code className="text-xs text-muted">{key.prefix}…</code>
                    </Td>
                    <Td numeric>
                      {key.lastUsedAt ? formatDateTime(new Date(key.lastUsedAt)) : "nunca"}
                    </Td>
                    <Td>
                      <Badge tone={key.revokedAt ? "neutral" : "success"}>
                        {key.revokedAt ? "Revogada" : "Ativa"}
                      </Badge>
                    </Td>
                    <Td>
                      {!key.revokedAt ? (
                        <div className="flex justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRevoke(key)}
                            aria-label={`Revogar ${key.name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : null}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      ) : null}

      {section === "webhooks" ? (
        <Card className="mb-4">
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>Webhooks</CardTitle>
              <CardDescription>
                Avisamos seu sistema quando algo acontece aqui. Cada chamada leva a assinatura
                HMAC-SHA256 do corpo no cabeçalho{" "}
                <code className="text-xs">{WEBHOOK_HEADER_SIGNATURE}</code>.
              </CardDescription>
            </div>
            <Button
              type="button"
              className="shrink-0"
              onClick={() =>
                setEditingHook({
                  id: "",
                  url: "",
                  events: ["lead.created"],
                  active: true,
                  lastStatus: null,
                  lastError: null,
                  lastAttemptAt: null,
                  failureCount: 0,
                })
              }
            >
              <Plus className="h-3.5 w-3.5" />
              Novo webhook
            </Button>
          </CardHeader>

          {webhooks.length === 0 ? (
            <EmptyState
              title="Nenhum webhook"
              description="Cadastre uma URL para receber avisos automáticos."
            />
          ) : (
            <Table>
              <Thead>
                <Tr>
                  <Th>Endereço</Th>
                  <Th>Eventos</Th>
                  <Th numeric>Última tentativa</Th>
                  <Th>Situação</Th>
                  <Th />
                </Tr>
              </Thead>
              <tbody>
                {webhooks.map((hook) => (
                  <Tr key={hook.id}>
                    <Td>
                      <code className="break-all text-xs">{hook.url}</code>
                    </Td>
                    <Td>{hook.events.map((event) => EVENT_LABELS[event] ?? event).join(", ")}</Td>
                    <Td numeric>
                      {hook.lastAttemptAt ? formatDateTime(new Date(hook.lastAttemptAt)) : "—"}
                    </Td>
                    <Td>
                      {!hook.active ? (
                        <Badge tone="neutral">Desligado</Badge>
                      ) : hook.lastError ? (
                        <Badge tone="danger">{hook.lastError}</Badge>
                      ) : hook.lastStatus ? (
                        <Badge tone="success">HTTP {hook.lastStatus}</Badge>
                      ) : (
                        <Badge tone="info">Sem entregas</Badge>
                      )}
                    </Td>
                    <Td>
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingHook(hook)}
                        >
                          Editar
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteHook(hook)}
                          aria-label="Remover webhook"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      ) : null}

      {section === "feed" && showFeed ? (
        <StockFeedCard tenantSlug={tenantSlug} onCopy={copy} />
      ) : null}

      {section === "chaves" ? (
        <Card>
          <CardHeader>
            <CardTitle>Como usar</CardTitle>
            <CardDescription>Dois endereços, autenticados pela chave.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-[13px]">
            <Endpoint
              method="GET"
              path="/api/v1/vehicles"
              description="Seu estoque. Aceita ?situacao=available e ?limite=50."
            />
            <Endpoint
              method="GET"
              path="/api/v1/leads"
              description="Seus leads. Aceita ?desde=2026-09-01 para sincronizar só o que é novo."
            />
            <Endpoint
              method="POST"
              path="/api/v1/leads"
              description="Envia um lead de fora: nome, telefone, email, mensagem, origem."
            />
          </CardContent>
        </Card>
      ) : null}

      {creatingKey ? (
        <Dialog
          open
          onClose={() => setCreatingKey(false)}
          title="Nova chave de API"
          description="Dê um nome que diga onde ela será usada, o que facilita revogar a certa depois."
          footer={
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setCreatingKey(false)}>
                Cancelar
              </Button>
              <Button type="button" loading={busy} onClick={handleCreateKey}>
                Criar chave
              </Button>
            </div>
          }
        >
          <FormField label="Nome" htmlFor="key-name" className="mb-0">
            <Input
              id="key-name"
              value={keyName}
              onChange={(event) => setKeyName(event.target.value)}
              placeholder="Integração com o portal X"
            />
          </FormField>
        </Dialog>
      ) : null}

      {editingHook ? (
        <WebhookEditor
          hook={editingHook}
          onClose={() => setEditingHook(null)}
          onSaved={(secret) => {
            setEditingHook(null);
            if (secret) setFreshSecret(secret);
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}

function Endpoint({
  method,
  path,
  description,
}: {
  method: string;
  path: string;
  description: string;
}) {
  return (
    <div className="border-b border-border pb-3 last:border-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={method === "GET" ? "info" : "success"}>{method}</Badge>
        <code className="break-all text-xs text-text">{path}</code>
      </div>
      <p className="mt-1 text-xs text-muted">{description}</p>
    </div>
  );
}

function WebhookEditor({
  hook,
  onClose,
  onSaved,
}: {
  hook: WebhookRow;
  onClose: () => void;
  onSaved: (secret?: string) => void;
}) {
  const toast = useToast();
  const isNew = !hook.id;
  const [url, setUrl] = useState(hook.url);
  const [events, setEvents] = useState<string[]>(hook.events);
  const [active, setActive] = useState(hook.active);
  const [saving, setSaving] = useState(false);

  function toggle(event: string, checked: boolean) {
    setEvents((current) =>
      checked ? [...new Set([...current, event])] : current.filter((item) => item !== event),
    );
  }

  async function handleSubmit(submit: React.FormEvent) {
    submit.preventDefault();
    setSaving(true);

    const payload = { url: url.trim(), events, active };
    const result = isNew
      ? await apiPost<{ secret: string }>("/api/admin/webhooks", payload)
      : await apiPatch(`/api/admin/webhooks/${hook.id}`, payload);

    setSaving(false);

    if (!result.ok) {
      toast.error(isNew ? "Não consegui criar" : "Não consegui salvar", result.error);
      return;
    }
    toast.success(isNew ? "Webhook criado" : "Webhook salvo");
    onSaved(isNew ? (result.data as { secret: string }).secret : undefined);
  }

  return (
    <Dialog
      open
      size="md"
      onClose={onClose}
      title={isNew ? "Novo webhook" : "Editar webhook"}
      description="Só endereços https são aceitos."
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="webhook-form" loading={saving}>
            {isNew ? "Criar webhook" : "Salvar"}
          </Button>
        </div>
      }
    >
      <form id="webhook-form" onSubmit={handleSubmit} noValidate>
        <FormField label="Endereço" htmlFor="hook-url">
          <Input
            id="hook-url"
            type="url"
            required
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://seusistema.com.br/webhook"
          />
        </FormField>

        <fieldset className="mb-4">
          <legend className="label-instrument mb-2 text-muted">Eventos</legend>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {TENANT_WEBHOOK_EVENTS.map((event) => (
              <label key={event} className="flex items-center gap-2 text-[13px] text-text">
                <Checkbox
                  checked={events.includes(event)}
                  onChange={(change) => toggle(event, change.target.checked)}
                />
                {EVENT_LABELS[event] ?? event}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="flex items-center gap-2 text-[13px] text-text">
          <Checkbox checked={active} onChange={(event) => setActive(event.target.checked)} />
          Ativo
        </label>
      </form>
    </Dialog>
  );
}

/**
 * Endereços do feed de estoque.
 *
 * É o que a revenda entrega ao portal quando fecha contrato — a maioria deles
 * importa por URL, buscando sozinha de tempos em tempos. Deixar pronto antes
 * do contrato tira o código do caminho crítico da negociação.
 */
function StockFeedCard({
  tenantSlug,
  onCopy,
}: {
  tenantSlug: string;
  onCopy: (value: string, what: string) => void;
}) {
  const [origin, setOrigin] = useState("");

  // montado no cliente porque depende do endereço em que a pessoa está
  useEffect(() => {
    setOrigin(window.location.origin + (document.documentElement.dataset.basePath ?? ""));
  }, []);

  const xml = `${origin}/r/${tenantSlug}/estoque.xml`;
  const json = `${origin}/r/${tenantSlug}/estoque.json`;

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>Feed de estoque</CardTitle>
        <CardDescription>
          Entregue um destes endereços ao portal de classificados. Ele busca sozinho e mantém os
          anúncios em dia. Só entram veículos disponíveis e reservados; rascunho e vendido ficam de
          fora.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <FeedLine label="XML" url={xml} onCopy={onCopy} />
        <FeedLine label="JSON" url={json} onCopy={onCopy} />
        <p className="text-xs text-faint">
          O feed é público, como o site. Se a revenda for suspensa, ele sai do ar junto.
        </p>
      </CardContent>
    </Card>
  );
}

function FeedLine({
  label,
  url,
  onCopy,
}: {
  label: string;
  url: string;
  onCopy: (value: string, what: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge tone="info">{label}</Badge>
      <code className="min-w-0 flex-1 break-all text-xs text-text">{url}</code>
      <Button type="button" size="sm" variant="secondary" onClick={() => onCopy(url, label)}>
        <Copy className="h-3.5 w-3.5" />
        Copiar
      </Button>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="text-xs text-muted underline-offset-2 hover:text-text hover:underline"
      >
        abrir
      </a>
    </div>
  );
}
