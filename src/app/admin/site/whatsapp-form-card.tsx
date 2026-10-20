"use client";

import { useId } from "react";
import { Lock } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  WHATSAPP_FORM_FIELDS,
  WHATSAPP_FORM_FIELD_LABELS,
  type WhatsappFormField,
} from "@carbud/site-kit/catalog";

/** Para que serve cada campo, dito do ponto de vista de quem vai atender. */
const FIELD_HINTS: Record<WhatsappFormField, string> = {
  name: "Para o vendedor saber com quem está falando.",
  email: "Para mandar proposta e ficha do carro por e-mail.",
  message: "Opcional para o cliente. Já chega dizendo o que quer.",
  tradeIn: "Opcional para o cliente. Adianta a avaliação do usado.",
};

/**
 * Formulário antes do WhatsApp, com espaço próprio.
 *
 * Era uma caixinha no fim do card de Contato e ninguém achava. Como muda o
 * comportamento de todos os botões de WhatsApp do site, ganhou card e switch;
 * os campos só aparecem com ele ligado, ao lado de uma prévia do que o cliente
 * vai ver.
 */
export function WhatsappFormCard({
  enabled,
  fields,
  hasWhatsapp,
  readOnly,
  onEnabledChange,
  onFieldsChange,
}: {
  enabled: boolean;
  fields: WhatsappFormField[];
  hasWhatsapp: boolean;
  readOnly?: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onFieldsChange: (fields: WhatsappFormField[]) => void;
}) {
  const titleId = useId();

  function toggle(field: WhatsappFormField, on: boolean) {
    // mantém a ordem do catálogo, que é a ordem em que o cliente vê os campos
    onFieldsChange(WHATSAPP_FORM_FIELDS.filter((item) => (item === field ? on : fields.includes(item))));
  }

  return (
    <Card>
      <CardHeader className={cn("flex items-start justify-between gap-4", !enabled && "border-b-0")}>
        <div className="min-w-0">
          <h2 id={titleId} className="text-base font-semibold text-text">
            Formulário antes do WhatsApp
          </h2>
          <p className="mt-1 text-[13px] text-muted">
            Quem clica em qualquer botão de WhatsApp do site preenche um formulário curto. O
            contato entra no CRM como lead, já com o carro, e a pessoa segue para a conversa.
          </p>
        </div>
        <Switch
          checked={enabled}
          disabled={readOnly}
          aria-labelledby={titleId}
          onChange={onEnabledChange}
        />
      </CardHeader>

      {enabled ? (
        <CardContent>
          {!hasWhatsapp ? (
            <Alert tone="warning" className="mb-4">
              Preencha o WhatsApp no card acima: sem ele, o site não mostra botão de WhatsApp.
            </Alert>
          ) : null}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,300px)]">
            <fieldset>
              <legend className="mb-2 text-[13px] font-medium text-text">O que pedir</legend>
              <ul className="divide-y divide-border rounded-inner border border-border">
                <li className="flex items-start gap-3 px-3 py-2.5">
                  <Lock className="mt-0.5 h-4 w-4 shrink-0 text-faint" aria-hidden="true" />
                  <div>
                    <p className="text-[13px] text-text">Telefone / WhatsApp</p>
                    <p className="text-xs text-muted">
                      Sempre pedido: sem ele, o lead não tem como ser atendido.
                    </p>
                  </div>
                </li>
                {WHATSAPP_FORM_FIELDS.map((field) => (
                  <li key={field}>
                    <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-surface-2/40">
                      <Checkbox
                        className="mt-0.5"
                        checked={fields.includes(field)}
                        disabled={readOnly}
                        onChange={(event) => toggle(field, event.target.checked)}
                      />
                      <span>
                        <span className="block text-[13px] text-text">
                          {WHATSAPP_FORM_FIELD_LABELS[field]}
                        </span>
                        <span className="block text-xs text-muted">{FIELD_HINTS[field]}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-faint">
                Quem já preencheu uma vez vai direto para o WhatsApp nas próximas, naquele
                navegador. Para testar de novo, use uma janela anônima.
              </p>
            </fieldset>

            <Preview fields={fields} />
          </div>
        </CardContent>
      ) : null}
    </Card>
  );
}

/** O formulário como o cliente vê, nas cores neutras do site, para conferir antes de salvar. */
function Preview({ fields }: { fields: WhatsappFormField[] }) {
  const rows: { label: string; optional?: boolean }[] = [
    ...(fields.includes("name") ? [{ label: "Nome" }] : []),
    { label: "Telefone / WhatsApp" },
    ...(fields.includes("email") ? [{ label: "E-mail" }] : []),
    ...(fields.includes("message") ? [{ label: "O que você procura?", optional: true }] : []),
    ...(fields.includes("tradeIn")
      ? [{ label: "Tem carro para dar na troca?", optional: true }]
      : []),
  ];

  return (
    <div aria-hidden="true">
      <p className="mb-2 text-[13px] font-medium text-text">Prévia</p>
      <div className="rounded-2xl bg-white p-4 text-slate-900 shadow-sm ring-1 ring-black/5">
        <p className="text-sm font-semibold">Falar no WhatsApp</p>
        <p className="mt-0.5 text-xs text-slate-500">Deixe seus dados para a loja te atender.</p>
        {rows.map((row, index) => (
          <div key={row.label} className={cn(index === 0 ? "mt-3" : "mt-2")}>
            <p className="mb-1 text-[11px] font-medium text-slate-500">
              {row.label}
              {row.optional ? <span className="font-normal text-slate-400"> (opcional)</span> : null}
            </p>
            <div className="h-8 rounded-md border border-slate-200" />
          </div>
        ))}
        <div className="mt-3 flex h-9 items-center justify-center rounded-md bg-[#25D366] text-xs font-medium text-white">
          Continuar para o WhatsApp
        </div>
      </div>
    </div>
  );
}
