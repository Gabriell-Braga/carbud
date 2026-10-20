"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Link2, Link2Off } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm";
import { Dialog } from "@/components/ui/dialog";
import { FormField, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { apiDelete, apiPost, fieldErrorsFrom, type FieldErrors } from "@/lib/client/api";
import { withBasePath } from "@/lib/paths";
import { formatDateTime } from "@/lib/utils";

export type WhatsappStatus = {
  phoneNumberId: string;
  wabaId: string | null;
  displayPhone: string | null;
  status: string;
  lastError: string | null;
  lastInboundAt: string | null;
} | null;

/**
 * Conexão com o WhatsApp oficial da loja.
 *
 * O número é da revenda, não nosso: o cliente precisa ver o telefone da loja
 * com quem já falou, e a resposta dele tem que chegar em quem vende.
 */
export function WhatsappConnection({
  connection,
  vaultReady,
  canWrite,
}: {
  connection: WhatsappStatus;
  vaultReady: boolean;
  canWrite: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [connecting, setConnecting] = useState(false);
  const [busy, setBusy] = useState(false);

  /**
   * Endereço montado no navegador, não no servidor.
   *
   * Atrás do proxy do Webflow o cabeçalho `host` chega com o domínio interno
   * da infraestrutura, e era isso que aparecia aqui. Entregar esse endereço à
   * Meta seria cadastrar um webhook num domínio que não é o nosso.
   */
  const [webhookUrl, setWebhookUrl] = useState("");

  useEffect(() => {
    // withBasePath, e não o data-base-path cru: em produção o atributo vem
    // vazio e a URL saía sem o /app, cadastrando um webhook que dá 404
    setWebhookUrl(`${window.location.origin}${withBasePath("/api/webhooks/whatsapp")}`);
  }, []);

  async function handleDisconnect() {
    const confirmed = await confirm({
      title: "Desconectar WhatsApp",
      description:
        "As credenciais são apagadas e as mensagens voltam a sair pelo aparelho do vendedor. As conversas já registradas continuam no histórico.",
      confirmLabel: "Desconectar",
      tone: "danger",
    });
    if (!confirmed) return;

    setBusy(true);
    const result = await apiDelete("/api/admin/whatsapp");
    setBusy(false);

    if (!result.ok) {
      toast.error("Não consegui desconectar", result.error);
      return;
    }
    toast.success("WhatsApp desconectado");
    router.refresh();
  }

  async function copyWebhook() {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      toast.success("Endereço copiado");
    } catch {
      toast.error("Não consegui copiar", "Selecione o texto e copie manualmente.");
    }
  }

  // sem conexão e sem aviso, o bloco do webhook é o primeiro conteúdo do
  // card: uma borda aqui encostaria na borda do cabeçalho
  const hasContentAbove = Boolean(connection) || !vaultReady || Boolean(connection?.lastError);

  return (
    <>
      <Card className="mb-4">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>WhatsApp oficial</CardTitle>
              <Badge tone={connection ? "success" : "neutral"}>
                {connection ? "Conectado" : "Não conectado"}
              </Badge>
            </div>
            <CardDescription>
              Conectado, as mensagens saem do número da loja e as respostas do cliente entram
              sozinhas no histórico do lead. Sem conexão, o vendedor continua mandando pelo próprio
              aparelho.
            </CardDescription>
          </div>

          {canWrite ? (
            <div className="shrink-0">
              {connection ? (
                <Button
                  type="button"
                  variant="outlineDanger"
                  size="sm"
                  loading={busy}
                  onClick={handleDisconnect}
                >
                  <Link2Off className="h-3.5 w-3.5" />
                  Desconectar
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  disabled={!vaultReady}
                  onClick={() => setConnecting(true)}
                >
                  <Link2 className="h-3.5 w-3.5" />
                  Conectar
                </Button>
              )}
            </div>
          ) : null}
        </CardHeader>

        <CardContent>
          {!vaultReady ? (
            <Alert tone="danger" className="mb-3">
              O cofre de credenciais não está configurado nesta instalação. Conectar está bloqueado.
            </Alert>
          ) : null}

          {connection?.lastError ? (
            <Alert tone="danger" className="mb-3">
              {connection.lastError}
            </Alert>
          ) : null}

          {connection ? (
            <div className="grid gap-3 text-[13px] sm:grid-cols-2">
              <Line label="Número" value={connection.displayPhone ?? "—"} />
              <Line
                label="Última mensagem recebida"
                value={
                  connection.lastInboundAt
                    ? formatDateTime(new Date(connection.lastInboundAt))
                    : "nenhuma ainda"
                }
              />
            </div>
          ) : null}

          <div className={hasContentAbove ? "mt-4 border-t border-border pt-4" : undefined}>
            <p className="label-instrument mb-1.5 text-muted">
              Endereço do webhook, para cadastrar na Meta
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 break-all text-xs text-text">{webhookUrl}</code>
              <Button type="button" size="sm" variant="secondary" onClick={copyWebhook}>
                <Copy className="h-3.5 w-3.5" />
                Copiar
              </Button>
            </div>
            <p className="mt-1.5 text-xs text-faint">
              Assine o campo <code>messages</code> no app da Meta e use o mesmo token de verificação
              que você cadastrar aqui.
            </p>
          </div>
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

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="label-instrument mb-1 text-muted">{label}</p>
      <p className="text-text">{value}</p>
    </div>
  );
}

function ConnectDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [values, setValues] = useState({
    phoneNumberId: "",
    wabaId: "",
    displayPhone: "",
    accessToken: "",
    appSecret: "",
    verifyToken: "",
  });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  function set(key: keyof typeof values, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setErrors({});

    const result = await apiPost("/api/admin/whatsapp", values);
    setSaving(false);

    if (!result.ok) {
      setErrors(fieldErrorsFrom(result.details));
      toast.error("Não consegui conectar", result.error);
      return;
    }
    toast.success("WhatsApp conectado", "Cadastre o webhook na Meta com o token que você definiu.");
    onSaved();
  }

  return (
    <Dialog
      open
      size="md"
      onClose={onClose}
      title="Conectar WhatsApp oficial"
      description="Os dados vêm do app da Meta em que o número está cadastrado."
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="whatsapp-form" loading={saving}>
            Conectar
          </Button>
        </div>
      }
    >
      <form id="whatsapp-form" onSubmit={handleSubmit} noValidate autoComplete="off">
        <div className="grid gap-x-4 sm:grid-cols-2">
          <FormField
            label="Phone Number ID"
            htmlFor="wa-phone-id"
            hint="Painel da Meta, na configuração da API."
            error={errors.phoneNumberId}
          >
            <Input
              id="wa-phone-id"
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              value={values.phoneNumberId}
              onChange={(event) => set("phoneNumberId", event.target.value)}
            />
          </FormField>

          <FormField
            label="WhatsApp Business Account ID"
            htmlFor="wa-waba"
            hint="Usado para listar os modelos aprovados."
          >
            <Input
              id="wa-waba"
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              value={values.wabaId}
              onChange={(event) => set("wabaId", event.target.value)}
            />
          </FormField>

          <FormField label="Número exibido" htmlFor="wa-display" hint="Só para aparecer na tela.">
            <Input
              id="wa-display"
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              value={values.displayPhone}
              onChange={(event) => set("displayPhone", event.target.value)}
              placeholder="+55 31 99999-8888"
            />
          </FormField>
        </div>

        <FormField
          label="Access Token"
          htmlFor="wa-token"
          hint="Use o token permanente de um usuário de sistema. O temporário expira em 24 horas."
          error={errors.accessToken}
        >
          <Input
            id="wa-token"
            type="password"
            autoComplete="new-password"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-1p-ignore
            data-lpignore="true"
            value={values.accessToken}
            onChange={(event) => set("accessToken", event.target.value)}
          />
        </FormField>

        <FormField
          label="App Secret"
          htmlFor="wa-secret"
          hint="É com ele que conferimos a assinatura das mensagens que a Meta manda."
          error={errors.appSecret}
        >
          <Input
            id="wa-secret"
            type="password"
            autoComplete="new-password"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-1p-ignore
            data-lpignore="true"
            value={values.appSecret}
            onChange={(event) => set("appSecret", event.target.value)}
          />
        </FormField>

        <FormField
          label="Token de verificação"
          htmlFor="wa-verify"
          hint="Você inventa este valor e repete igual no cadastro do webhook na Meta."
          error={errors.verifyToken}
        >
          <Input
            id="wa-verify"
            autoComplete="new-password"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-1p-ignore
            data-lpignore="true"
            value={values.verifyToken}
            onChange={(event) => set("verifyToken", event.target.value)}
          />
        </FormField>

        <Alert tone="info">
          Token e segredo são cifrados antes de tocar no banco e nunca voltam para esta tela.
        </Alert>
      </form>
    </Dialog>
  );
}
