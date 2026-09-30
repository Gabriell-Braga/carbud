"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox, FormField, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { apiPatch, fieldErrorsFrom, type FieldErrors } from "@/lib/client/api";

export type SettingsShape = {
  finePercent: number;
  interestPercent: number;
  defaultTrialDays: number;
  gatewayNotifications: boolean;
  defaultGraceDays: number;
};

export function SettingsForm({ settings }: { settings: SettingsShape }) {
  const router = useRouter();
  const toast = useToast();
  const [draft, setDraft] = useState<SettingsShape>(settings);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setErrors({});

    const result = await apiPatch("/api/super-admin/settings", {
      finePercent: Number(draft.finePercent) || 0,
      interestPercent: Number(draft.interestPercent) || 0,
      defaultTrialDays: Number(draft.defaultTrialDays) || 0,
      gatewayNotifications: draft.gatewayNotifications,
      defaultGraceDays: Number(draft.defaultGraceDays) || 0,
    });

    setSaving(false);

    if (!result.ok) {
      setErrors(fieldErrorsFrom(result.details));
      toast.error("Não foi possível salvar", result.error);
      return;
    }

    toast.success("Configurações salvas", "Valem para as próximas contratações.");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Cobrança</CardTitle>
          <CardDescription>
            Multa e juros vão para o gateway no momento em que a assinatura é criada. Assinatura já
            existente mantém o que foi pactuado: mudar aqui não reescreve contrato em andamento.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-4">
            <FormField
              label="Multa por atraso (%)"
              htmlFor="fine"
              hint="Cobrada uma vez, no vencimento."
              error={errors.finePercent}
            >
              <Input
                id="fine"
                type="number"
                min={0}
                max={100}
                value={draft.finePercent}
                onChange={(event) =>
                  setDraft({ ...draft, finePercent: Number(event.target.value) })
                }
              />
            </FormField>

            <FormField
              label="Juros ao mês (%)"
              htmlFor="interest"
              hint="Proporcional aos dias de atraso."
              error={errors.interestPercent}
            >
              <Input
                id="interest"
                type="number"
                min={0}
                max={100}
                value={draft.interestPercent}
                onChange={(event) =>
                  setDraft({ ...draft, interestPercent: Number(event.target.value) })
                }
              />
            </FormField>

            <FormField
              label="Tolerância (dias)"
              htmlFor="grace"
              hint="Do vencimento até a suspensão."
              error={errors.defaultGraceDays}
            >
              <Input
                id="grace"
                type="number"
                min={0}
                max={90}
                value={draft.defaultGraceDays}
                onChange={(event) =>
                  setDraft({ ...draft, defaultGraceDays: Number(event.target.value) })
                }
              />
            </FormField>

            <FormField
              label="Teste grátis (dias)"
              htmlFor="trial"
              hint="Padrão para planos sem trial próprio."
              error={errors.defaultTrialDays}
            >
              <Input
                id="trial"
                type="number"
                min={0}
                max={365}
                value={draft.defaultTrialDays}
                onChange={(event) =>
                  setDraft({ ...draft, defaultTrialDays: Number(event.target.value) })
                }
              />
            </FormField>
          </div>

          <label className="flex items-start gap-2 text-[13px] text-text">
            <Checkbox
              className="mt-0.5"
              checked={draft.gatewayNotifications}
              onChange={(event) =>
                setDraft({ ...draft, gatewayNotifications: event.target.checked })
              }
            />
            <span>
              Deixar o gateway avisar o pagador
              <span className="block text-xs text-faint">
                Desligado, ninguém recebe aviso de vencimento, e a revenda descobre a dívida quando
                o painel bloqueia.
              </span>
            </span>
          </label>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" loading={saving}>
          Salvar configurações
        </Button>
      </div>
    </form>
  );
}
