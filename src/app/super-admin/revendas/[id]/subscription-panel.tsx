"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField, Input, Select } from "@/components/ui/field";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { apiDelete, apiPost, fieldErrorsFrom, type FieldErrors } from "@/lib/client/api";
import { formatCurrency, formatDate } from "@/lib/utils";

export type SubscriptionSummary = {
  status: string;
  billingType: string;
  priceCents: number;
  couponCode: string | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  gatewaySubscriptionId: string | null;
  lastEventType: string | null;
  lastEventAt: string | null;
};

export type PlanOption = {
  id: string;
  name: string;
  priceCents: number;
  billingMode: string;
  trialDays: number;
};

const STATUS_LABELS: Record<string, string> = {
  trialing: "Em teste",
  active: "Ativa",
  past_due: "Em atraso",
  canceled: "Cancelada",
  manual: "Negociada",
};

const STATUS_TONES: Record<string, BadgeTone> = {
  trialing: "info",
  active: "success",
  past_due: "warning",
  canceled: "neutral",
  manual: "info",
};

export function SubscriptionPanel({
  tenantId,
  affiliateCode: existingAffiliateCode,
  hasCnpj,
  subscription,
  planName,
  plans,
  billedCents,
}: {
  tenantId: string;
  /** Origem já registrada: a contratação não troca. */
  affiliateCode: string | null;
  hasCnpj: boolean;
  subscription: SubscriptionSummary | null;
  planName: string | null;
  plans: PlanOption[];
  /** O que a revenda realmente paga, vindo da cobrança. */
  billedCents: number | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const [billingType, setBillingType] = useState("UNDEFINED");
  const [couponCode, setCouponCode] = useState("");
  const [affiliateCode, setAffiliateCode] = useState("");
  const [dueDay, setDueDay] = useState("");
  const [working, setWorking] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const selectedPlan = plans.find((plan) => plan.id === planId) ?? null;
  const needsCnpj = selectedPlan?.billingMode === "gateway" && !hasCnpj;
  const active = subscription && subscription.status !== "canceled";

  async function handleContract(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setErrors({});

    const result = await apiPost<{ mode: string; planName: string; nextDueDate: string }>(
      `/api/super-admin/tenants/${tenantId}/subscription`,
      {
        planId,
        billingType,
        couponCode: couponCode.trim() || undefined,
        dueDay: dueDay ? Number(dueDay) : undefined,
        affiliateCode: existingAffiliateCode ? undefined : affiliateCode.trim() || undefined,
      },
    );

    setWorking(false);

    if (!result.ok) {
      setErrors(fieldErrorsFrom(result.details));
      toast.error("Não foi possível contratar", result.error);
      return;
    }

    toast.success(
      "Plano contratado",
      result.data.mode === "gateway"
        ? `Assinatura criada no gateway. Primeiro vencimento em ${formatDate(new Date(result.data.nextDueDate))}.`
        : "Registrado como cobrança negociada, fora do gateway.",
    );
    router.refresh();
  }

  async function handleCancel() {
    const confirmed = await confirm({
      title: "Cancelar assinatura",
      description:
        "A cobrança automática para no gateway e a revenda volta ao controle manual. O acesso não é cortado agora: quem decide isso é a régua de vencimento.",
      confirmLabel: "Cancelar assinatura",
      cancelLabel: "Manter assinatura",
      tone: "danger",
    });
    if (!confirmed) return;

    setWorking(true);
    const result = await apiDelete(`/api/super-admin/tenants/${tenantId}/subscription`);
    setWorking(false);

    if (!result.ok) {
      toast.error("Não foi possível cancelar", result.error);
      return;
    }
    toast.success("Assinatura cancelada", "A cobrança automática foi interrompida.");
    router.refresh();
  }

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>Assinatura</CardTitle>
        <CardDescription>
          O plano define limites e funcionalidades. Em plano automático, o gateway cobra sozinho e o
          webhook atualiza a situação aqui.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {active ? (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Plano" value={planName ?? "—"} />
              <Field
                label="Situação"
                value={
                  <Badge tone={STATUS_TONES[subscription.status] ?? "neutral"}>
                    {STATUS_LABELS[subscription.status] ?? subscription.status}
                  </Badge>
                }
              />
              {/*
                O valor sai da cobrança, não do preço de catálogo do plano.
                Enterprise vale zero na tabela porque é negociado caso a caso,
                mostrar esse zero aqui contradizia a mensalidade ao lado.
              */}
              <Field
                label="Valor"
                value={formatCurrency(billedCents ?? subscription.priceCents)}
              />
              <Field
                label="Próximo ciclo"
                value={
                  subscription.currentPeriodEnd
                    ? formatDate(new Date(subscription.currentPeriodEnd))
                    : "—"
                }
              />
            </div>

            {subscription.trialEndsAt ? (
              <Alert tone="info">
                Em teste até {formatDate(new Date(subscription.trialEndsAt))}. A primeira cobrança
                sai nessa data.
              </Alert>
            ) : null}

            {subscription.couponCode ? (
              <p className="text-[13px] text-muted">
                Cupom aplicado: <strong className="text-text">{subscription.couponCode}</strong>
              </p>
            ) : null}

            {subscription.lastEventType ? (
              <p className="text-xs text-faint">
                Último evento do gateway: {subscription.lastEventType}
                {subscription.lastEventAt
                  ? ` em ${formatDate(new Date(subscription.lastEventAt))}`
                  : ""}
              </p>
            ) : (
              <p className="text-xs text-faint">
                Nenhum evento do gateway recebido ainda para esta revenda.
              </p>
            )}

            <div className="flex justify-end border-t border-border pt-4">
              <Button
                type="button"
                variant="outlineDanger"
                loading={working}
                onClick={handleCancel}
              >
                Cancelar assinatura
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleContract} noValidate>
            {plans.length === 0 ? (
              <Alert tone="warning">
                Nenhum plano ativo cadastrado. Crie um plano antes de contratar.
              </Alert>
            ) : (
              <>
                {needsCnpj ? (
                  <Alert tone="warning" className="mb-4">
                    Este plano cobra pelo gateway e o gateway exige CNPJ. Preencha o CNPJ na aba
                    &quot;Dados e template&quot; antes de contratar.
                  </Alert>
                ) : null}

                <div className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-4">
                  <FormField label="Plano" htmlFor="sub-plan" error={errors.planId}>
                    <Select
                      id="sub-plan"
                      value={planId}
                      onChange={(event) => setPlanId(event.target.value)}
                    >
                      {plans.map((plan) => (
                        <option key={plan.id} value={plan.id}>
                          {plan.name} · {formatCurrency(plan.priceCents)}
                          {plan.billingMode === "manual" ? " (negociado)" : ""}
                        </option>
                      ))}
                    </Select>
                  </FormField>

                  <FormField
                    label="Forma de pagamento"
                    htmlFor="sub-billing-type"
                    hint="Deixe em aberto para o cliente escolher."
                    error={errors.billingType}
                  >
                    <Select
                      id="sub-billing-type"
                      value={billingType}
                      onChange={(event) => setBillingType(event.target.value)}
                    >
                      <option value="UNDEFINED">Cliente escolhe</option>
                      <option value="PIX">Pix</option>
                      <option value="BOLETO">Boleto</option>
                      <option value="CREDIT_CARD">Cartão de crédito</option>
                    </Select>
                  </FormField>

                  <FormField
                    label="Dia do vencimento"
                    htmlFor="sub-due-day"
                    hint="1 a 28. Vazio mantém o atual."
                    error={errors.dueDay}
                  >
                    <Input
                      id="sub-due-day"
                      type="number"
                      min={1}
                      max={28}
                      value={dueDay}
                      onChange={(event) => setDueDay(event.target.value)}
                    />
                  </FormField>

                  <FormField
                    label="Cupom"
                    htmlFor="sub-coupon"
                    hint="Opcional."
                    error={errors.couponCode}
                  >
                    <Input
                      id="sub-coupon"
                      value={couponCode}
                      onChange={(event) => setCouponCode(event.target.value.toUpperCase())}
                    />
                  </FormField>
                </div>

                {/* separado do cupom de propósito: código de afiliado não dá desconto */}
                {existingAffiliateCode ? (
                  <p className="mb-4 text-[13px] text-muted">
                    Afiliado de origem já registrado:{" "}
                    <strong className="font-mono text-text">{existingAffiliateCode}</strong>. Para
                    trocar, use &quot;Corrigir origem&quot; abaixo.
                  </p>
                ) : (
                  <div className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-4">
                    <FormField
                      label="Código do afiliado (opcional)"
                      htmlFor="sub-affiliate"
                      hint="Quem indicou a revenda. Não dá desconto."
                      error={errors.affiliateCode}
                    >
                      <Input
                        id="sub-affiliate"
                        value={affiliateCode}
                        placeholder="AF-..."
                        onChange={(event) => setAffiliateCode(event.target.value.toUpperCase())}
                      />
                    </FormField>
                  </div>
                )}

                {selectedPlan && selectedPlan.trialDays > 0 ? (
                  <p className="mb-4 text-[13px] text-muted">
                    Este plano tem {selectedPlan.trialDays} dias de teste, e a primeira cobrança só
                    sai depois disso.
                  </p>
                ) : null}

                <div className="flex justify-end">
                  <Button type="submit" loading={working} disabled={needsCnpj}>
                    Contratar plano
                  </Button>
                </div>
              </>
            )}
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="label-instrument mb-1 text-muted">{label}</p>
      <div className="text-[13px] text-text">{value}</div>
    </div>
  );
}
