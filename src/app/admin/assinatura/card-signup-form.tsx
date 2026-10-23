"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { apiPost, errorMessageFrom, fieldErrorsFrom, type FieldErrors } from "@/lib/client/api";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { maskCep, maskPhone } from "@carbud/site-kit/masks";

type PlanChoice = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  highlighted: boolean;
};

type Holder = {
  name: string;
  email: string;
  cpfCnpj: string;
  postalCode: string;
  addressNumber: string;
  phone: string;
};

/**
 * Contratação no cartão. O cartão vai direto para o gateway pelo servidor e
 * não fica guardado aqui: depois de enviado, o estado do formulário é limpo.
 */
export function CardSignupForm({
  plans,
  promoCents,
  firstFullChargeAt,
  hasAffiliation,
  defaults,
}: {
  plans: PlanChoice[];
  promoCents: number;
  firstFullChargeAt: string;
  hasAffiliation: boolean;
  defaults: Holder;
}) {
  const router = useRouter();
  const toast = useToast();
  const id = useId();
  const [planId, setPlanId] = useState(
    (plans.find((plan) => plan.highlighted) ?? plans[0]).id,
  );
  const [card, setCard] = useState({ holderName: "", number: "", expiry: "", ccv: "" });
  const [holder, setHolder] = useState<Holder>({
    ...defaults,
    postalCode: maskCep(defaults.postalCode),
    phone: maskPhone(defaults.phone.replace(/^\+?55(?=\d{10,11}$)/, "")),
  });
  const [affiliateCode, setAffiliateCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const plan = plans.find((item) => item.id === planId)!;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const [month = "", year = ""] = card.expiry.split("/").map((part) => part.trim());
    setSaving(true);
    setErrors({});

    const result = await apiPost<{ planName: string; nextDueDate: string }>(
      "/api/admin/subscription",
      {
        planId,
        card: { holderName: card.holderName, number: card.number, expiryMonth: month, expiryYear: year, ccv: card.ccv },
        holder,
        affiliateCode: hasAffiliation ? undefined : affiliateCode.trim() || undefined,
      },
    );
    setSaving(false);

    if (!result.ok) {
      setErrors(fieldErrorsFrom(result.details));
      // o código de segurança nunca fica preenchido depois de uma tentativa
      setCard((current) => ({ ...current, ccv: "" }));
      toast.error(
        result.error === "Dados inválidos" ? "Confira os campos destacados" : "Não foi possível contratar",
        result.error === "Dados inválidos" ? errorMessageFrom(result) : result.error,
      );
      return;
    }

    setCard({ holderName: "", number: "", expiry: "", ccv: "" });
    toast.success(
      `${result.data.planName} contratado`,
      `Cobramos ${formatCurrency(promoCents)} agora. A próxima cobrança é em ${formatDate(new Date(result.data.nextDueDate))}.`,
    );
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Escolha o plano</CardTitle>
          <CardDescription>
            Primeiro mês por {formatCurrency(promoCents)}. A partir de{" "}
            {formatDate(new Date(firstFullChargeAt))}, o valor do plano é cobrado todo mês no
            mesmo cartão, até você cancelar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div role="radiogroup" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {plans.map((item) => (
              <label
                key={item.id}
                className={cn(
                  "flex cursor-pointer flex-col gap-1 rounded border p-4 transition-colors",
                  item.id === planId ? "border-accent bg-accent-soft" : "border-border hover:bg-surface-2",
                )}
              >
                <input
                  type="radio"
                  name={`${id}-plan`}
                  value={item.id}
                  checked={item.id === planId}
                  onChange={() => setPlanId(item.id)}
                  className="sr-only"
                />
                <span className="flex items-center gap-2 font-medium text-text">
                  {item.name}
                  {item.highlighted ? <Badge tone="info">Recomendado</Badge> : null}
                </span>
                <span className="text-[13px] text-muted">{formatCurrency(item.priceCents)}/mês</span>
                {item.description ? <span className="text-xs text-faint">{item.description}</span> : null}
              </label>
            ))}
          </div>
          {errors.planId ? <p className="mt-2 text-xs text-danger">{errors.planId}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cartão de crédito</CardTitle>
          <CardDescription>
            Os dados vão direto para o meio de pagamento (Asaas) e não ficam guardados no painel.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
            <FormField label="Nome impresso no cartão" htmlFor={`${id}-cc-name`} error={errors["card.holderName"]}>
              <Input
                id={`${id}-cc-name`}
                autoComplete="cc-name"
                value={card.holderName}
                onChange={(event) => setCard({ ...card, holderName: event.target.value.toUpperCase() })}
              />
            </FormField>
            <FormField label="Número do cartão" htmlFor={`${id}-cc-number`} error={errors["card.number"]}>
              <Input
                id={`${id}-cc-number`}
                autoComplete="cc-number"
                inputMode="numeric"
                value={card.number}
                onChange={(event) =>
                  setCard({
                    ...card,
                    number: event.target.value.replace(/\D/g, "").slice(0, 19).replace(/(\d{4})(?=\d)/g, "$1 "),
                  })
                }
              />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-x-4 sm:grid-cols-4">
            <FormField
              label="Validade (MM/AA)"
              htmlFor={`${id}-cc-exp`}
              error={errors["card.expiryMonth"] ?? errors["card.expiryYear"]}
            >
              <Input
                id={`${id}-cc-exp`}
                autoComplete="cc-exp"
                inputMode="numeric"
                placeholder="MM/AA"
                value={card.expiry}
                onChange={(event) => {
                  const value = event.target.value.replace(/\D/g, "").slice(0, 4);
                  setCard({ ...card, expiry: value.length > 2 ? `${value.slice(0, 2)}/${value.slice(2)}` : value });
                }}
              />
            </FormField>
            <FormField label="Código de segurança" htmlFor={`${id}-cc-csc`} error={errors["card.ccv"]}>
              <Input
                id={`${id}-cc-csc`}
                autoComplete="cc-csc"
                inputMode="numeric"
                value={card.ccv}
                onChange={(event) => setCard({ ...card, ccv: event.target.value.replace(/\D/g, "").slice(0, 4) })}
              />
            </FormField>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Titular do cartão</CardTitle>
          <CardDescription>O antifraude confere estes dados com os do cartão.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
            <FormField label="Nome ou razão social" htmlFor={`${id}-h-name`} error={errors["holder.name"]}>
              <Input id={`${id}-h-name`} value={holder.name} onChange={(event) => setHolder({ ...holder, name: event.target.value })} />
            </FormField>
            <FormField label="CPF ou CNPJ" htmlFor={`${id}-h-doc`} error={errors["holder.cpfCnpj"]}>
              <Input id={`${id}-h-doc`} inputMode="numeric" value={holder.cpfCnpj} onChange={(event) => setHolder({ ...holder, cpfCnpj: event.target.value })} />
            </FormField>
            <FormField label="E-mail" htmlFor={`${id}-h-email`} error={errors["holder.email"]}>
              <Input id={`${id}-h-email`} type="email" value={holder.email} onChange={(event) => setHolder({ ...holder, email: event.target.value })} />
            </FormField>
            <FormField label="Telefone" htmlFor={`${id}-h-phone`} error={errors["holder.phone"]}>
              <Input id={`${id}-h-phone`} inputMode="tel" value={holder.phone} onChange={(event) => setHolder({ ...holder, phone: maskPhone(event.target.value) })} />
            </FormField>
            <FormField label="CEP" htmlFor={`${id}-h-cep`} error={errors["holder.postalCode"]}>
              <Input id={`${id}-h-cep`} inputMode="numeric" value={holder.postalCode} onChange={(event) => setHolder({ ...holder, postalCode: maskCep(event.target.value) })} />
            </FormField>
            <FormField label="Número do endereço" htmlFor={`${id}-h-number`} error={errors["holder.addressNumber"]}>
              <Input id={`${id}-h-number`} value={holder.addressNumber} onChange={(event) => setHolder({ ...holder, addressNumber: event.target.value })} />
            </FormField>
          </div>

          {!hasAffiliation ? (
            <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
              <FormField
                label="Código de quem indicou (opcional)"
                htmlFor={`${id}-affiliate`}
                hint="Não dá desconto."
                error={errors.affiliateCode}
              >
                <Input
                  id={`${id}-affiliate`}
                  placeholder="AF-..."
                  value={affiliateCode}
                  onChange={(event) => setAffiliateCode(event.target.value.toUpperCase())}
                />
              </FormField>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex flex-col items-end gap-2">
        <p className="text-right text-[13px] text-muted">
          Hoje: <strong className="text-text">{formatCurrency(promoCents)}</strong>. A partir de{" "}
          {formatDate(new Date(firstFullChargeAt))}:{" "}
          <strong className="text-text">{formatCurrency(plan.priceCents)}/mês</strong>.
        </p>
        <Button type="submit" loading={saving}>
          Pagar {formatCurrency(promoCents)} e contratar
        </Button>
      </div>
    </form>
  );
}
