"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox, FormField, Input, Select, Textarea } from "@/components/ui/field";
import { CurrencyInput, IntegerInput } from "@/components/ui/number-field";
import { useToast } from "@/components/ui/toast";
import { PAYMENT_METHODS, type LeadNegotiation, type PaymentMethod } from "@/db/schema";
import { PAYMENT_METHOD_LABELS } from "@/lib/catalog/labels";
import { apiPatch } from "@/lib/client/api";

/**
 * Ficha de negociação: o que o cliente quer, como paga e o que dá na troca.
 *
 * Marca e modelo são texto mesmo com o carro do estoque vinculado: o cliente
 * pode querer "um Kwid" que a loja ainda não tem, e é esse desejo que a
 * campanha procura quando chegar um.
 */
export function NegotiationCard({
  leadId,
  initial,
  canWrite,
}: {
  leadId: string;
  initial: LeadNegotiation;
  canWrite: boolean;
}) {
  const id = useId();
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState<LeadNegotiation>(initial);
  const [hasTrade, setHasTrade] = useState(Boolean(initial.tradeIn));
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof LeadNegotiation>(key: K, value: LeadNegotiation[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const setTrade = (key: keyof NonNullable<LeadNegotiation["tradeIn"]>, value: string | number) =>
    setForm((current) => ({ ...current, tradeIn: { ...current.tradeIn, [key]: value } }));

  async function save() {
    setSaving(true);
    const result = await apiPatch(`/api/admin/leads/${leadId}`, {
      negotiation: {
        ...form,
        valueCents: form.valueCents || undefined,
        downPaymentCents: form.downPaymentCents || undefined,
        tradeIn: hasTrade
          ? {
              ...form.tradeIn,
              year: form.tradeIn?.year || undefined,
              mileageKm: form.tradeIn?.mileageKm ?? undefined,
              valueCents: form.tradeIn?.valueCents || undefined,
            }
          : null,
      },
    });
    setSaving(false);
    if (!result.ok) {
      toast.error("Não consegui salvar a ficha", result.error);
      return;
    }
    toast.success("Ficha de negociação salva");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Negociação</CardTitle>
        <CardDescription>
          Interesse, pagamento e troca. Fica salvo para campanhas futuras.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <fieldset disabled={!canWrite} className="min-w-0">
          <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-3">
            <FormField label="Marca de interesse" htmlFor={`${id}-brand`}>
              <Input
                id={`${id}-brand`}
                value={form.brand ?? ""}
                maxLength={60}
                onChange={(event) => set("brand", event.target.value)}
                placeholder="Renault"
              />
            </FormField>
            <FormField label="Modelo" htmlFor={`${id}-model`}>
              <Input
                id={`${id}-model`}
                value={form.model ?? ""}
                maxLength={80}
                onChange={(event) => set("model", event.target.value)}
                placeholder="Kwid"
              />
            </FormField>
            <FormField label="Versão" htmlFor={`${id}-version`}>
              <Input
                id={`${id}-version`}
                value={form.version ?? ""}
                maxLength={120}
                onChange={(event) => set("version", event.target.value)}
              />
            </FormField>
            <FormField label="Forma de pagamento" htmlFor={`${id}-payment`}>
              <Select
                id={`${id}-payment`}
                value={form.paymentMethod ?? ""}
                onChange={(event) =>
                  set("paymentMethod", (event.target.value || undefined) as PaymentMethod | undefined)
                }
              >
                <option value="">Não sabe ainda</option>
                {PAYMENT_METHODS.map((item) => (
                  <option key={item} value={item}>
                    {PAYMENT_METHOD_LABELS[item]}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Valor negociado" htmlFor={`${id}-value`}>
              <CurrencyInput
                id={`${id}-value`}
                valueCents={form.valueCents ?? 0}
                onChangeCents={(cents) => set("valueCents", cents)}
              />
            </FormField>
            <FormField label="Entrada" htmlFor={`${id}-down`}>
              <CurrencyInput
                id={`${id}-down`}
                valueCents={form.downPaymentCents ?? 0}
                onChangeCents={(cents) => set("downPaymentCents", cents)}
              />
            </FormField>
          </div>

          <div className="mb-4 flex flex-wrap gap-x-6 gap-y-2 text-[13px]">
            <label className="inline-flex items-center gap-2">
              <Checkbox
                checked={Boolean(form.testDrive)}
                onChange={(event) => set("testDrive", event.target.checked)}
              />
              Fez test drive
            </label>
            <label className="inline-flex items-center gap-2">
              <Checkbox checked={hasTrade} onChange={(event) => setHasTrade(event.target.checked)} />
              Tem carro na troca
            </label>
          </div>

          {hasTrade ? (
            <div className="mb-4 grid grid-cols-1 gap-x-3 rounded border border-border p-3 sm:grid-cols-3">
              <FormField label="Marca da troca" htmlFor={`${id}-trade-brand`}>
                <Input
                  id={`${id}-trade-brand`}
                  value={form.tradeIn?.brand ?? ""}
                  maxLength={60}
                  onChange={(event) => setTrade("brand", event.target.value)}
                />
              </FormField>
              <FormField label="Modelo" htmlFor={`${id}-trade-model`}>
                <Input
                  id={`${id}-trade-model`}
                  value={form.tradeIn?.model ?? ""}
                  maxLength={80}
                  onChange={(event) => setTrade("model", event.target.value)}
                />
              </FormField>
              <FormField label="Ano" htmlFor={`${id}-trade-year`}>
                <Input
                  id={`${id}-trade-year`}
                  inputMode="numeric"
                  maxLength={4}
                  value={form.tradeIn?.year ? String(form.tradeIn.year) : ""}
                  onChange={(event) =>
                    setTrade("year", Number(event.target.value.replace(/\D/g, "")) || 0)
                  }
                />
              </FormField>
              <FormField label="Quilometragem" htmlFor={`${id}-trade-km`} className="sm:mb-0">
                <IntegerInput
                  id={`${id}-trade-km`}
                  value={form.tradeIn?.mileageKm ?? 0}
                  onChangeNumber={(value) => setTrade("mileageKm", value)}
                />
              </FormField>
              <FormField label="Valor avaliado" htmlFor={`${id}-trade-value`} className="mb-0">
                <CurrencyInput
                  id={`${id}-trade-value`}
                  valueCents={form.tradeIn?.valueCents ?? 0}
                  onChangeCents={(cents) => setTrade("valueCents", cents)}
                />
              </FormField>
            </div>
          ) : null}

          <FormField label="Como está a negociação" htmlFor={`${id}-notes`}>
            <Textarea
              id={`${id}-notes`}
              rows={3}
              maxLength={4000}
              value={form.notes ?? ""}
              onChange={(event) => set("notes", event.target.value)}
              placeholder="Veio à loja, achou o valor alto; ofereci revisão grátis..."
            />
          </FormField>
        </fieldset>

        <div className="flex flex-wrap justify-end gap-2">
          <Link
            href={`/admin/leads/${leadId}/proposta`}
            className="inline-flex h-8 items-center gap-1.5 rounded border border-border px-3.5 text-xs text-text hover:bg-surface-2"
          >
            <FileText className="h-3.5 w-3.5" />
            Gerar proposta
          </Link>
          {canWrite ? (
            <Button type="button" size="sm" loading={saving} onClick={save}>
              Salvar ficha
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
