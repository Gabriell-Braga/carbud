"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { ArrowRight, Check, CircleCheck, CreditCard, Lock, ShieldCheck } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { APP_NAME } from "@/lib/brand";
import { Button } from "@/components/ui/button";
import { Checkbox, FormField, Input } from "@/components/ui/field";
import { PasswordInput, PasswordRequirements } from "@/components/ui/password-input";
import { apiPost, fieldErrorsFrom, type FieldErrors } from "@/lib/client/api";
import { cn, formatCurrency, formatDate, onlyDigits } from "@/lib/utils";
import { maskCep, maskCnpj, maskCpf, maskPhone } from "@carbud/site-kit/masks";

type PlanChoice = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  priceCents: number;
  highlighted: boolean;
  features: string[];
};

const maskDocument = (value: string) =>
  onlyDigits(value).length > 11 ? maskCnpj(value) : maskCpf(value);

/**
 * Checkout público. O cartão vai direto para o gateway pelo servidor e não
 * fica guardado aqui: o código de segurança é limpo a cada tentativa.
 */
export function CheckoutForm({
  plans,
  initialPlanId,
  affiliateCode: initialAffiliateCode,
  promoCents,
  firstFullChargeAt,
  captchaSiteKey,
}: {
  plans: PlanChoice[];
  initialPlanId: string;
  affiliateCode: string;
  promoCents: number;
  firstFullChargeAt: string;
  captchaSiteKey: string | null;
}) {
  const router = useRouter();
  const id = useId();
  const [planId, setPlanId] = useState(initialPlanId);
  const [account, setAccount] = useState({ storeName: "", document: "", name: "", email: "", password: "", phone: "" });
  const [card, setCard] = useState({ holderName: "", number: "", expiry: "", ccv: "" });
  const [billing, setBilling] = useState({ postalCode: "", addressNumber: "" });
  const [otherHolder, setOtherHolder] = useState(false);
  const [holderDocument, setHolderDocument] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  // o bloco de confirmação aparece em dois lugares (celular e desktop), mas o widget é um só:
  // vai para o espaço que estiver visível quando o script carregar
  // ponytail: quem cruza o breakpoint depois de carregar fica sem captcha até recarregar
  const captchaSlots = useRef<(HTMLDivElement | null)[]>([]);
  const captchaWidget = useRef<string | null>(null);

  const renderCaptcha = useCallback(() => {
    const slot = captchaSlots.current.find((el) => el?.offsetParent);
    if (!captchaSiteKey || !slot || !window.turnstile || captchaWidget.current) return;
    captchaWidget.current = window.turnstile.render(slot, {
      sitekey: captchaSiteKey,
      size: "flexible",
      language: "pt-br",
      callback: setCaptchaToken,
      "expired-callback": () => setCaptchaToken(""),
    });
  }, [captchaSiteKey]);
  const [affiliateCode, setAffiliateCode] = useState(initialAffiliateCode);
  const [done, setDone] = useState<{ planName: string; nextDueDate: string; redirectTo: string } | null>(null);
  const paymentTracked = useRef(false);

  const plan = plans.find((item) => item.id === planId)!;

  // o funil abre com o plano que veio da página de planos; trocar de plano reabre
  useEffect(() => {
    pushEcommerce("begin_checkout", plan, promoCents);
  }, [plan, promoCents]);

  function trackPaymentInfo() {
    if (paymentTracked.current) return;
    paymentTracked.current = true;
    pushEcommerce("add_payment_info", plan, promoCents, { payment_type: "credit_card" });
  }
  const firstFullCharge = formatDate(new Date(firstFullChargeAt));

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const [month = "", year = ""] = card.expiry.split("/").map((part) => part.trim());
    setSaving(true);
    setErrors({});
    setFailure(null);

    const result = await apiPost<{
      planName: string;
      nextDueDate: string;
      redirectTo: string;
      transactionId: string;
    }>(
      "/api/public/checkout",
      {
        planId,
        account: {
          storeName: account.storeName,
          document: account.document,
          name: account.name,
          email: account.email,
          password: account.password,
        },
        card: { holderName: card.holderName, number: card.number, expiryMonth: month, expiryYear: year, ccv: card.ccv },
        // o titular do cartão é a própria revenda, salvo quando a pessoa diz que não
        holder: {
          name: card.holderName,
          email: account.email,
          cpfCnpj: otherHolder ? holderDocument : account.document,
          postalCode: billing.postalCode,
          addressNumber: billing.addressNumber,
          phone: account.phone,
        },
        affiliateCode: affiliateCode.trim() || undefined,
        acceptedTerms,
        captchaToken: captchaToken || undefined,
      },
    );
    setSaving(false);

    if (!result.ok) {
      setErrors(fieldErrorsFrom(result.details));
      setCard((current) => ({ ...current, ccv: "" }));
      // o token do captcha vale para um envio só
      setCaptchaToken("");
      if (captchaWidget.current) window.turnstile?.reset(captchaWidget.current);
      setFailure(
        result.error === "Dados inválidos" ? "Confira os campos destacados." : result.error,
      );
      return;
    }

    setCard({ holderName: "", number: "", expiry: "", ccv: "" });
    pushEcommerce("purchase", plan, promoCents, {
      transaction_id: result.data.transactionId,
      affiliation: affiliateCode.trim() || undefined,
    });
    setDone(result.data);
    window.scrollTo({ top: 0 });
  }

  if (done) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-border bg-surface p-8 text-center sm:p-10">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-positive-soft text-positive">
          <CircleCheck className="h-7 w-7" aria-hidden="true" />
        </span>
        <h1 className="mt-5 font-display text-2xl font-semibold tracking-tight text-text">
          Tudo pronto, {account.name.split(" ")[0]}!
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          O plano {done.planName} da {account.storeName} está ativo. Cobramos{" "}
          {formatCurrency(promoCents)} agora, e a próxima cobrança, de{" "}
          {formatCurrency(plan.priceCents)}, é em {formatDate(new Date(done.nextDueDate))}.
        </p>
        <Button size="lg" className="mt-8 w-full" onClick={() => router.push(done.redirectTo)}>
          Ir para o painel
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Button>
        <p className="mt-3 text-xs text-faint">Entre depois com {account.email} e a senha que você criou.</p>
      </div>
    );
  }

  const confirm = (slot: number) => (
    <>
      <div>
        <label className="flex cursor-pointer items-start gap-2.5 text-[13px] text-muted">
          <Checkbox
            className="mt-0.5"
            checked={acceptedTerms}
            onChange={(event) => setAcceptedTerms(event.target.checked)}
            aria-invalid={Boolean(errors.acceptedTerms) || undefined}
          />
          <span>
            Li e aceito os{" "}
            <Link href="/termos" target="_blank" className="text-accent-text underline">
              Termos de Uso
            </Link>
            , inclusive a cobrança mensal recorrente no cartão até o cancelamento.
          </span>
        </label>
        {errors.acceptedTerms ? (
          <p className="mt-1.5 text-xs text-danger" role="alert">
            {errors.acceptedTerms}
          </p>
        ) : null}
      </div>
      {captchaSiteKey ? (
        <div
          ref={(el) => {
            captchaSlots.current[slot] = el;
          }}
        />
      ) : null}
      {failure ? <Alert tone="danger">{failure}</Alert> : null}
      <Button type="submit" size="lg" loading={saving} className="w-full">
        <Lock className="h-4 w-4" aria-hidden="true" />
        Pagar {formatCurrency(promoCents)} e começar
      </Button>
    </>
  );

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)] lg:gap-10"
    >
      <div className="min-w-0">
        <p className="label-instrument text-accent-text">Contratação</p>
        <h1 className="mt-2 font-display text-[28px] font-semibold leading-tight tracking-tight text-text">
          Sua revenda no ar em minutos
        </h1>
        <p className="mt-2 text-sm text-muted">
          Primeiro mês por {formatCurrency(promoCents)}. Sem fidelidade: cancele quando quiser.
        </p>

        <div className="mt-8 space-y-5">
          <Step number={1} title="Sua revenda" description="Como ela aparece no painel e no site.">
            <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
              <FormField label="Nome da revenda" htmlFor={`${id}-store`} error={errors["account.storeName"]}>
                <Input
                  id={`${id}-store`}
                  autoComplete="organization"
                  value={account.storeName}
                  onChange={(event) => setAccount({ ...account, storeName: event.target.value })}
                />
              </FormField>
              <FormField
                label="CNPJ (ou CPF)"
                htmlFor={`${id}-doc`}
                error={errors["account.document"] ?? (otherHolder ? undefined : errors["holder.cpfCnpj"])}
              >
                <Input
                  id={`${id}-doc`}
                  inputMode="numeric"
                  value={account.document}
                  onChange={(event) => setAccount({ ...account, document: maskDocument(event.target.value) })}
                />
              </FormField>
            </div>
          </Step>

          <Step number={2} title="Seu acesso" description="Você entra no painel com este e-mail e senha.">
            <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
              <FormField label="Seu nome" htmlFor={`${id}-name`} error={errors["account.name"]}>
                <Input
                  id={`${id}-name`}
                  autoComplete="name"
                  value={account.name}
                  onChange={(event) => setAccount({ ...account, name: event.target.value })}
                />
              </FormField>
              <FormField label="WhatsApp" htmlFor={`${id}-phone`} error={errors["holder.phone"]}>
                <Input
                  id={`${id}-phone`}
                  autoComplete="tel-national"
                  inputMode="tel"
                  value={account.phone}
                  onChange={(event) => setAccount({ ...account, phone: maskPhone(event.target.value) })}
                />
              </FormField>
              <FormField
                label="E-mail"
                htmlFor={`${id}-email`}
                error={errors["account.email"] ?? errors["holder.email"]}
              >
                <Input
                  id={`${id}-email`}
                  type="email"
                  autoComplete="email"
                  value={account.email}
                  onChange={(event) => setAccount({ ...account, email: event.target.value })}
                />
              </FormField>
              <FormField label="Senha" htmlFor={`${id}-password`} error={errors["account.password"]}>
                <PasswordInput
                  id={`${id}-password`}
                  autoComplete="new-password"
                  value={account.password}
                  onChange={(event) => setAccount({ ...account, password: event.target.value })}
                />
                <PasswordRequirements value={account.password} />
              </FormField>
            </div>
          </Step>

          <Step
            number={3}
            title="Pagamento"
            description="Cartão de crédito. Os dados vão direto para o Asaas e não ficam guardados."
            icon={<CreditCard className="h-4 w-4 text-muted" aria-hidden="true" />}
          >
            <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
              <FormField label="Número do cartão" htmlFor={`${id}-cc-number`} error={errors["card.number"]}>
                <Input
                  id={`${id}-cc-number`}
                  autoComplete="cc-number"
                  inputMode="numeric"
                  onFocus={trackPaymentInfo}
                  placeholder="0000 0000 0000 0000"
                  value={card.number}
                  onChange={(event) =>
                    setCard({
                      ...card,
                      number: event.target.value.replace(/\D/g, "").slice(0, 19).replace(/(\d{4})(?=\d)/g, "$1 "),
                    })
                  }
                />
              </FormField>
              <FormField
                label="Nome impresso no cartão"
                htmlFor={`${id}-cc-name`}
                error={errors["card.holderName"] ?? errors["holder.name"]}
              >
                <Input
                  id={`${id}-cc-name`}
                  autoComplete="cc-name"
                  value={card.holderName}
                  onChange={(event) => setCard({ ...card, holderName: event.target.value.toUpperCase() })}
                />
              </FormField>
            </div>
            <div className="grid grid-cols-2 gap-x-4 sm:grid-cols-4">
              <FormField
                label="Validade"
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
              <FormField label="CVV" htmlFor={`${id}-cc-csc`} error={errors["card.ccv"]}>
                <Input
                  id={`${id}-cc-csc`}
                  autoComplete="cc-csc"
                  inputMode="numeric"
                  placeholder="123"
                  value={card.ccv}
                  onChange={(event) => setCard({ ...card, ccv: event.target.value.replace(/\D/g, "").slice(0, 4) })}
                />
              </FormField>
              <FormField label="CEP da cobrança" htmlFor={`${id}-cep`} error={errors["holder.postalCode"]}>
                <Input
                  id={`${id}-cep`}
                  autoComplete="postal-code"
                  inputMode="numeric"
                  value={billing.postalCode}
                  onChange={(event) => setBilling({ ...billing, postalCode: maskCep(event.target.value) })}
                />
              </FormField>
              <FormField label="Número" htmlFor={`${id}-number`} error={errors["holder.addressNumber"]}>
                <Input
                  id={`${id}-number`}
                  value={billing.addressNumber}
                  onChange={(event) => setBilling({ ...billing, addressNumber: event.target.value })}
                />
              </FormField>
            </div>

            <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-muted">
              <Checkbox checked={otherHolder} onChange={(event) => setOtherHolder(event.target.checked)} />
              O cartão está em nome de outro CPF ou CNPJ
            </label>
            {otherHolder ? (
              <div className="mt-4 grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                <FormField label="CPF ou CNPJ do titular" htmlFor={`${id}-holder-doc`} error={errors["holder.cpfCnpj"]}>
                  <Input
                    id={`${id}-holder-doc`}
                    inputMode="numeric"
                    value={holderDocument}
                    onChange={(event) => setHolderDocument(maskDocument(event.target.value))}
                  />
                </FormField>
              </div>
            ) : null}
          </Step>

          <div className="grid grid-cols-1 gap-x-4 px-1 sm:grid-cols-2">
            <FormField
              label="Código de quem indicou (opcional)"
              htmlFor={`${id}-affiliate`}
              hint="Não dá desconto."
              error={errors.affiliateCode}
              className="mb-0"
            >
              <Input
                id={`${id}-affiliate`}
                value={affiliateCode}
                onChange={(event) => setAffiliateCode(event.target.value.toUpperCase())}
              />
            </FormField>
          </div>
        </div>

        {captchaSiteKey ? (
          <Script
            src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
            onReady={renderCaptcha}
          />
        ) : null}

        <div className="mt-6 space-y-4 px-1 lg:hidden">{confirm(0)}</div>
      </div>

      {/* resumo do pedido: no celular vem antes do formulário, que é o que se está comprando */}
      <aside className="order-first min-w-0 lg:order-none">
        <div className="space-y-4 lg:sticky lg:top-8">
          <div className="overflow-hidden rounded-2xl border border-border bg-surface">
            <div className="p-5">
              <p className="label-instrument text-muted">Seu plano</p>
              <div role="radiogroup" aria-label="Plano" className="mt-3 grid grid-cols-1 gap-2">
                {plans.map((item) => (
                  <label
                    key={item.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors",
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
                    <span
                      aria-hidden="true"
                      className={cn(
                        "grid h-4 w-4 shrink-0 place-items-center rounded-full border",
                        item.id === planId ? "border-accent bg-accent" : "border-border-strong/30",
                      )}
                    >
                      {item.id === planId ? <span className="h-1.5 w-1.5 rounded-full bg-accent-contrast" /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-text">
                        {item.name}
                        {item.highlighted ? (
                          <span className="whitespace-nowrap rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent-contrast">
                            Mais escolhido
                          </span>
                        ) : null}
                      </span>
                      {item.description ? (
                        <span className="mt-0.5 block truncate text-xs text-muted">{item.description}</span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-[13px] text-muted">{formatCurrency(item.priceCents)}/mês</span>
                  </label>
                ))}
              </div>
              {errors.planId ? <p className="mt-2 text-xs text-danger">{errors.planId}</p> : null}

              {plan.features.length > 0 ? (
                <ul className="mt-5 grid grid-cols-1 gap-2">
                  {plan.features.slice(0, 8).map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-[13px] text-text">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-text" aria-hidden="true" />
                      {feature}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            <div className="bg-accent p-5 text-accent-contrast">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs opacity-80">Total hoje</p>
                  <p className="font-display text-[32px] font-semibold leading-none tracking-tight">
                    {formatCurrency(promoCents)}
                  </p>
                </div>
                <p className="text-right text-xs opacity-80">primeiro mês promocional</p>
              </div>
              <p className="mt-4 border-t border-accent-contrast/20 pt-3 text-[13px]">
                A partir de {firstFullCharge}: <strong>{formatCurrency(plan.priceCents)}/mês</strong> no mesmo
                cartão, até você cancelar.
              </p>
            </div>
          </div>

          <div className="hidden space-y-4 lg:block">{confirm(1)}</div>

          <ul className="space-y-2 px-1 text-xs text-muted">
            <li className="flex items-center gap-2">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Pagamento processado pelo Asaas, com antifraude.
            </li>
            <li className="flex items-center gap-2">
              <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Os dados do cartão não ficam guardados no {APP_NAME}.
            </li>
          </ul>
        </div>
      </aside>
    </form>
  );
}

function Step({
  number,
  title,
  description,
  icon,
  children,
}: {
  number: number;
  title: string;
  description: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
      <div className="mb-5 flex items-start gap-3">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent-soft text-[13px] font-semibold text-accent-text">
          {number}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold text-text">
            {title}
            {icon}
          </h2>
          <p className="mt-0.5 text-[13px] text-muted">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

/**
 * Evento de e-commerce padrão do GA4 no dataLayer, para o GTM da página.
 * O valor é o que se cobra hoje (o primeiro mês promocional); a mensalidade
 * cheia vai junto para quem quiser medir receita recorrente.
 */
function pushEcommerce(event: string, plan: PlanChoice, promoCents: number, extra: Record<string, unknown> = {}) {
  const value = promoCents / 100;
  window.dataLayer = window.dataLayer || [];
  // o GA4 pede zerar o ecommerce anterior para um evento não herdar itens do outro
  window.dataLayer.push({ ecommerce: null });
  window.dataLayer.push({
    event,
    plan_monthly_value: plan.priceCents / 100,
    ecommerce: {
      currency: "BRL",
      value,
      ...extra,
      items: [
        {
          item_id: plan.slug,
          item_name: plan.name,
          item_category: "Plano",
          item_variant: "Primeiro mês promocional",
          price: value,
          quantity: 1,
        },
      ],
    },
  });
}

declare global {
  interface Window {
    dataLayer?: unknown[];
    turnstile?: {
      render: (
        element: HTMLElement,
        options: {
          sitekey: string;
          size?: "normal" | "flexible" | "compact";
          language?: string;
          callback: (token: string) => void;
          "expired-callback"?: () => void;
        },
      ) => string;
      reset: (widgetId: string) => void;
    };
  }
}
