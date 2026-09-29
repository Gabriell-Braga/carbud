"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Plus, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox, FormField, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { apiPatch, apiPost, errorMessageFrom } from "@/lib/client/api";

export type NotificationValues = {
  newLead: boolean;
  notifyAssignee: boolean;
  leadRecipients: string[];
};

/**
 * Avisos por e-mail da operação.
 *
 * Desligado por padrão: ninguém gosta de ser inscrito em e-mail sem pedir, e
 * revenda com muito lead prefere olhar a lista. Quem liga escolhe quem
 * recebe — o vendedor responsável, endereços fixos, ou os dois.
 */
export function NotificationsPanel({
  initial,
  emailReady,
  suggestions,
  readOnly,
}: {
  initial: NotificationValues;
  /** A instalação tem provedor de e-mail configurado. */
  emailReady: boolean;
  /** E-mails da equipe, para preencher com um clique. */
  suggestions: string[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();

  const [values, setValues] = useState(initial);
  const [novo, setNovo] = useState("");
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);

  async function save(next: NotificationValues) {
    setValues(next);
    setBusy(true);
    const result = await apiPatch("/api/admin/notifications", next);
    setBusy(false);

    if (!result.ok) {
      setValues(values);
      toast.error("Não consegui salvar", errorMessageFrom(result));
      return;
    }
    toast.success("Avisos salvos");
    router.refresh();
  }

  function addRecipient(address: string) {
    const limpo = address.trim().toLowerCase();
    if (!limpo) return;
    if (values.leadRecipients.includes(limpo)) {
      setNovo("");
      return;
    }
    void save({ ...values, leadRecipients: [...values.leadRecipients, limpo] });
    setNovo("");
  }

  async function handleTest() {
    setTesting(true);
    const result = await apiPost<{ sent: string[] }>("/api/admin/notifications", {});
    setTesting(false);

    if (!result.ok) {
      toast.error("Não consegui enviar", result.error);
      return;
    }
    toast.success("E-mail de teste enviado", result.data.sent.join(", "));
  }

  const naoUsados = suggestions.filter((item) => !values.leadRecipients.includes(item));

  return (
    <div className="flex flex-col gap-4">
      {!emailReady ? (
        <Alert tone="warning">
          Nenhum provedor de e-mail está configurado nesta instalação, então nada é enviado ainda.
          Pode deixar os avisos preparados: eles passam a sair assim que o envio for ligado.
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Lead novo</CardTitle>
          <CardDescription>
            Um e-mail assim que o contato entra, venha do site ou de um portal, com telefone e
            link para a ficha.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-start gap-2 text-[13px] text-text">
            <Checkbox
              checked={values.newLead}
              disabled={readOnly || busy}
              onChange={(event) => save({ ...values, newLead: event.target.checked })}
            />
            <span>
              Avisar por e-mail quando entrar um lead
              <span className="mt-0.5 block text-xs text-faint">
                O lead continua aparecendo na tela de Leads, com ou sem aviso.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-2 text-[13px] text-text">
            <Checkbox
              checked={values.notifyAssignee}
              disabled={readOnly || busy || !values.newLead}
              onChange={(event) => save({ ...values, notifyAssignee: event.target.checked })}
            />
            <span>
              Avisar o vendedor responsável
              <span className="mt-0.5 block text-xs text-faint">
                Vale quando o rodízio distribui o lead, e também quando alguém atribui na mão.
              </span>
            </span>
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Quem mais recebe</CardTitle>
          <CardDescription>
            Endereços que recebem todo lead, além do vendedor responsável. Deixe vazio se só o
            responsável deve saber.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {values.leadRecipients.length > 0 ? (
            <ul className="divide-y divide-border">
              {values.leadRecipients.map((address) => (
                <li key={address} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0 break-all text-[13px] text-text">{address}</span>
                  {!readOnly ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remover ${address}`}
                      disabled={busy}
                      onClick={() =>
                        save({
                          ...values,
                          leadRecipients: values.leadRecipients.filter(
                            (item) => item !== address,
                          ),
                        })
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-muted">Nenhum endereço fixo cadastrado.</p>
          )}

          {!readOnly ? (
            <>
              <div className="flex items-end gap-2">
                <FormField label="Adicionar endereço" htmlFor="novo-email" className="mb-0 flex-1">
                  <Input
                    id="novo-email"
                    type="email"
                    value={novo}
                    placeholder="vendas@revenda.com.br"
                    disabled={busy}
                    onChange={(event) => setNovo(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addRecipient(novo);
                      }
                    }}
                  />
                </FormField>
                <Button type="button" variant="secondary" disabled={busy} onClick={() => addRecipient(novo)}>
                  <Plus className="h-3.5 w-3.5" />
                  Adicionar
                </Button>
              </div>

              {naoUsados.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-faint">Da sua equipe:</span>
                  {naoUsados.map((address) => (
                    <Button
                      key={address}
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => addRecipient(address)}
                    >
                      {address}
                    </Button>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
        </CardContent>
      </Card>

      {!readOnly ? (
        <div>
          <Button
            type="button"
            variant="secondary"
            loading={testing}
            disabled={!emailReady}
            onClick={handleTest}
          >
            <Mail className="h-3.5 w-3.5" />
            Enviar e-mail de teste
          </Button>
          <p className="mt-2 text-xs text-faint">
            Vai para você e para os endereços cadastrados, com um lead de exemplo.
          </p>
        </div>
      ) : null}
    </div>
  );
}
