"use client";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { EmailCopyOverrides } from "@/lib/email/templates";
import { TemplateEditor } from "./template-editor";

/**
 * Aba de e-mail: quem entrega, e o que é entregue.
 *
 * A pergunta "o e-mail está ligado?" só tinha resposta olhando variável de
 * ambiente no Webflow Cloud. A pergunta "o que a revenda recebe?" só tinha
 * resposta abrindo o código. As duas ficam aqui, em cartões separados: o
 * primeiro é consulta de dez segundos, o segundo é onde se trabalha.
 */
export function EmailPanel({
  provider,
  from,
  defaultTo,
  overrides,
}: {
  provider: "ses" | "resend" | null;
  /** Remetente configurado, só para conferir sem abrir o Webflow Cloud. */
  from: string | null;
  defaultTo: string;
  overrides: EmailCopyOverrides;
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Envio</CardTitle>
            <CardDescription>Provedor e remetente vêm das variáveis de ambiente.</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            {provider === "ses" ? (
              <Badge tone="success">Amazon SES</Badge>
            ) : provider === "resend" ? (
              <Badge tone="success">Resend</Badge>
            ) : (
              <Badge tone="warning">Sem provedor</Badge>
            )}
            {from ? <code className="text-xs text-muted">{from}</code> : null}
          </div>
        </CardHeader>
        {!provider ? (
          <CardContent>
            <Alert tone="warning">
              Sem provedor, nada é enviado. A redefinição de senha continua funcionando: o link
              aparece em Usuários, para entregar à pessoa.
            </Alert>
          </CardContent>
        ) : null}
      </Card>

      <TemplateEditor overrides={overrides} canSend={provider !== null} defaultTo={defaultTo} />
    </div>
  );
}
