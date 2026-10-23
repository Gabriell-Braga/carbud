import { billingDate, brazilDateParts } from "./brazil-date";

/**
 * Primeiro pagamento promocional da contratação no cartão.
 *
 * É uma cobrança avulsa (fora da assinatura), e o webhook precisa reconhecê-la
 * sem consultar o banco: ela chega em milissegundos, antes de a contratação
 * terminar de gravar qualquer coisa. Por isso a marca vai na própria
 * referência externa que o Asaas devolve.
 */
export const PROMO_FIRST_PAYMENT_CENTS = 500;

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
