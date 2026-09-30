"use client";

import { useState } from "react";
import { Mail, Send } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { apiPost } from "@/lib/client/api";

/**
 * Situação do e-mail da instalação, e amostras para conferir o desenho.
 *
 * A pergunta "o e-mail está ligado?" só tinha resposta olhando variável de
 * ambiente no Webflow Cloud. E a pergunta "como ele chega?" só tinha resposta
 * esperando um lead de verdade — ler o HTML não serve, porque Gmail, Outlook
 * e Apple Mail renderizam de formas diferentes.
 */
export function EmailPanel({
  provider,
  from,
  defaultTo,
}: {
  provider: "ses" | "resend" | null;
  /** Remetente configurado, só para conferir sem abrir o Webflow Cloud. */
  from: string | null;
  defaultTo: string;
}) {
  const toast = useToast();
  const [to, setTo] = useState(defaultTo);
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    const result = await apiPost("/api/super-admin/email-samples", { to });
    setBusy(false);

    if (!result.ok) {
      toast.error("Não consegui enviar", result.error);
      return;
    }
    toast.success("Amostras enviadas", `Quatro mensagens para ${to}.`);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>E-mail</CardTitle>
        <CardDescription>
          Quem entrega as mensagens do produto: redefinição de senha, convite de usuário, lead
          novo e lead atribuído.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <span className="text-muted">Provedor:</span>
          {provider === "ses" ? (
            <Badge tone="success">Amazon SES</Badge>
          ) : provider === "resend" ? (
            <Badge tone="success">Resend</Badge>
          ) : (
            <Badge tone="warning">Nenhum</Badge>
          )}
          {from ? <code className="text-xs text-muted">{from}</code> : null}
        </div>

        {!provider ? (
          <Alert tone="warning">
            Sem provedor, nada é enviado. A redefinição de senha continua funcionando: o link
            aparece em Usuários, para entregar à pessoa.
          </Alert>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-2">
              <FormField label="Mandar amostras para" htmlFor="amostras-para" className="mb-0 min-w-64 flex-1">
                <Input
                  id="amostras-para"
                  type="email"
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                />
              </FormField>
              <Button type="button" loading={busy} onClick={send}>
                <Send className="h-3.5 w-3.5" />
                Enviar as quatro
              </Button>
            </div>
            <p className="flex items-start gap-2 text-xs text-faint">
              <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Dados de exemplo, com o assunto marcado como amostra. O link de senha aponta para um
              token que não existe — clicar nele mostra a tela de link inválido.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
