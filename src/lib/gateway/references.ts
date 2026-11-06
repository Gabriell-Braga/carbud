import { billingDate, brazilDateParts } from "./brazil-date";

/**
 * Primeiro pagamento da contratação no cartão.
 *
 * É uma cobrança avulsa (fora da assinatura), e o webhook precisa reconhecê-la
 * sem consultar o banco: ela chega em milissegundos, antes de a contratação
 * terminar de gravar qualquer coisa. Por isso a marca vai na própria
 * referência externa que o Asaas devolve. O prefixo "promo:" ficou do tempo em
 * que todo primeiro mês era promocional; hoje marca o primeiro pagamento,
 * promocional ou não.
 */

/** O que do cupom decide o primeiro pagamento e a mensalidade. */
export type CheckoutCoupon = {
  code: string;
  discountType: "PERCENTAGE" | "FIXED";
  /** Percentual (0-100) ou centavos, conforme o tipo. */
  discountValue: number;
  /** Primeiro mês por este valor; null = primeiro mês pela mensalidade. */
  firstPaymentCents: number | null;
  planIds: string[] | null;
};

export function couponAppliesTo(coupon: CheckoutCoupon, planId: string): boolean {
  return !coupon.planIds?.length || coupon.planIds.includes(planId);
}

/** Desconto recorrente do cupom sobre a mensalidade, em centavos. */
export function couponCentsOff(priceCents: number, coupon: CheckoutCoupon): number {
  const off =
    coupon.discountType === "PERCENTAGE"
      ? Math.round((priceCents * coupon.discountValue) / 100)
      : coupon.discountValue;
  return Math.min(off, priceCents);
}

/**
 * Quanto se cobra na hora: o valor promocional do cupom, ou a mensalidade
 * (com o desconto do cupom, se houver). Servidor e tela usam a mesma conta.
 */
export function firstPaymentCents(priceCents: number, coupon: CheckoutCoupon | null): number {
  if (!coupon) return priceCents;
  return coupon.firstPaymentCents ?? priceCents - couponCentsOff(priceCents, coupon);
}

const PROMO_PREFIX = "promo:";

export function promoReference(tenantId: string): string {
  return `${PROMO_PREFIX}${tenantId}`;
}

/** Revenda da referência externa e se é o pagamento promocional. */
export function parsePaymentReference(
  reference: string | null | undefined,
): { tenantId: string | null; promo: boolean } {
  if (!reference) return { tenantId: null, promo: false };
  if (reference.startsWith(PROMO_PREFIX)) {
    return { tenantId: reference.slice(PROMO_PREFIX.length) || null, promo: true };
  }
  return { tenantId: reference, promo: false };
}

/**
 * Primeiro vencimento da assinatura depois do pagamento promocional: mesmo dia
 * no mês seguinte, no fuso de Brasília. Dia 29 a 31 vira 28, que é o limite do
 * dia de vencimento da régua — e assim os dois sempre concordam.
 */
export function promoNextDueDate(now = new Date()): Date {
  const today = brazilDateParts(now);
  const day = Math.min(today.day, 28);
  const month = today.month === 12 ? 1 : today.month + 1;
  const year = today.month === 12 ? today.year + 1 : today.year;
  return billingDate({ year, month, day });
}
