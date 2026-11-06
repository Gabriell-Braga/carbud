"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Link2, Link2Off } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { useConfirm } from "@/components/ui/confirm";
import { Dialog } from "@/components/ui/dialog";
import { FormField, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { apiDelete, apiPut, fieldErrorsFrom, type FieldErrors } from "@/lib/client/api";
import { withBasePath } from "@/lib/paths";
import { formatDateTime } from "@/lib/utils";

export type MetaLeadsStatus = {
  pageId: string;
  pageName: string | null;
  lastError: string | null;
  lastLeadAt: string | null;
} | null;

/**
 * Cadastro de anúncio do Facebook e do Instagram caindo direto como lead.
 *
 * Mesmo desenho do WhatsApp oficial: o app e a página são da loja, o token
 * vai para o cofre, e a Meta chama o nosso webhook a cada cadastro.
 */
export function MetaLeadsConnection({
  connection,
  vaultReady,
  canWrite,
}: {
  connection: MetaLeadsStatus;
  vaultReady: boolean;
  canWrite: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [connecting, setConnecting] = useState(false);
  const [busy, setBusy] = useState(false);
  // montado no navegador: atrás do proxy o host do servidor é o interno
  const [webhookUrl, setWebhookUrl] = useState("");
  useEffect(() => {
    setWebhookUrl(`${window.location.origin}${withBasePath("/api/webhooks/meta-leads")}`);
  }, []);

  async function disconnect() {
    const ok = await confirm({
      title: "Desligar anúncios da Meta",
      description: "Os próximos cadastros dos anúncios deixam de entrar como lead. Os que já entraram ficam.",
      confirmLabel: "Desligar",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(true);
    const result = await apiDelete("/api/admin/meta-leads");
    setBusy(false);
    if (!result.ok) {
      toast.error("Não consegui desligar", result.error);
      return;
    }
    router.refresh();
  }

  return (
    <>
      <Card className="mb-4">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>Anúncios do Facebook e Instagram</CardTitle>
              <Badge tone={connection ? "success" : "neutral"}>
                {connection ? "Conectado" : "Não conectado"}
              </Badge>
            </div>
            <CardDescription>
              Quem preenche o formulário de um anúncio de cadastro vira lead aqui na hora, já
              distribuído para um vendedor.
            </CardDescription>
          </div>
          {canWrite ? (
            connection ? (
              <Button type="button" variant="outlineDanger" size="sm" loading={busy} onClick={disconnect}>
                <Link2Off className="h-3.5 w-3.5" />
                Desligar
              </Button>
            ) : (
              <Button type="button" size="sm" disabled={!vaultReady} onClick={() => setConnecting(true)}>
                <Link2 className="h-3.5 w-3.5" />
                Conectar
              </Button>
            )
          ) : null}
        </CardHeader>
        <CardContent>
          {connection?.lastError ? (
            <Alert tone="danger" className="mb-3">
              {connection.lastError}
            </Alert>
          ) : null}
          {connection ? (
            <p className="mb-4 text-[13px] text-muted">
              Página {connection.pageName ?? connection.pageId} · último cadastro:{" "}
              {connection.lastLeadAt ? formatDateTime(new Date(connection.lastLeadAt)) : "nenhum ainda"}
            </p>
          ) : null}
          <p className="label-instrument mb-1.5 text-muted">Endereço do webhook, para cadastrar na Meta</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all text-xs text-text">{webhookUrl}</code>
            <CopyButton value={webhookUrl} />
          </div>
          <p className="mt-1.5 text-xs text-faint">
            No app da Meta, produto Webhooks, objeto <code>Page</code>, assine o campo{" "}
            <code>leadgen</code> com o mesmo token de verificação que você cadastrar aqui. O token da
            página precisa da permissão <code>leads_retrieval</code>.
          </p>
        </CardContent>
      </Card>

      {connecting ? (
        <ConnectDialog
          onClose={() => setConnecting(false)}
          onSaved={() => {
            setConnecting(false);
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}

const FIELDS = [
  { key: "pageId", label: "ID da página", hint: "Números, em Configurações da página → Sobre.", secret: false },
  { key: "pageName", label: "Nome da página", hint: "Só para aparecer na tela.", secret: false },
  {
    key: "pageAccessToken",
    label: "Token da página",
    hint: "Token permanente de usuário de sistema com leads_retrieval e pages_manage_metadata.",
    secret: true,
  },
  { key: "appSecret", label: "Chave secreta do app", hint: "Confere que o aviso veio mesmo da Meta.", secret: true },
  { key: "verifyToken", label: "Token de verificação", hint: "Invente um e use o mesmo na Meta.", secret: true },
] as const;

function ConnectDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [values, setValues] = useState<Record<(typeof FIELDS)[number]["key"], string>>({
    pageId: "",
    pageName: "",
    pageAccessToken: "",
    appSecret: "",
    verifyToken: "",
  });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    const result = await apiPut("/api/admin/meta-leads", values);
    setSaving(false);
    if (!result.ok) {
      setErrors(fieldErrorsFrom(result.details));
      toast.error("Não consegui conectar", result.error);
      return;
    }
    toast.success("Anúncios conectados", "Cadastre o webhook na Meta com o token de verificação.");
    onSaved();
  }

  return (
    <Dialog
      open
      size="md"
      onClose={onClose}
      title="Conectar anúncios do Facebook e Instagram"
      description="Os dados vêm do app da Meta ligado à página da loja."
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="meta-leads-form" loading={saving}>
            Conectar
          </Button>
        </div>
      }
    >
      <form id="meta-leads-form" onSubmit={submit} noValidate autoComplete="off">
        {FIELDS.map((field) => (
          <FormField
            key={field.key}
            label={field.label}
            htmlFor={`meta-${field.key}`}
            hint={field.hint}
            error={errors[field.key]}
          >
            <Input
              id={`meta-${field.key}`}
              type={field.secret ? "password" : "text"}
              autoComplete={field.secret ? "new-password" : "off"}
              spellCheck={false}
              data-1p-ignore
              data-lpignore="true"
              value={values[field.key]}
              onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}
            />
          </FormField>
        ))}
      </form>
    </Dialog>
  );
}
