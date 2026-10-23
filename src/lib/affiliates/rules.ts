/**
 * Regras puras do programa de afiliados: código, percentual, base e direito
 * de comissão. Nada aqui toca banco nem rede — é o que decide dinheiro de
 * terceiro e precisa ser testável isolado.
 */

/** Sem 0/O, 1/I/L: o código é ditado por telefone e digitado à mão. */
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_LENGTH = 10;
export const AFFILIATE_CODE_PATTERN = new RegExp(`^AF-[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

export const MAX_COMMISSION_BPS = 10_000;

export function generateAffiliateCode(
  randomBytes: (size: number) => Uint8Array = (size) =>
    crypto.getRandomValues(new Uint8Array(size)),
): string {
  // rejeição em vez de módulo: 256 não é múltiplo de 31 e o módulo enviesaria
  const limit = 256 - (256 % CODE_ALPHABET.length);
  let code = "";
  while (code.length < CODE_LENGTH) {
    for (const byte of randomBytes(CODE_LENGTH * 2)) {
      if (byte >= limit) continue;
      code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
      if (code.length === CODE_LENGTH) break;
    }
  }
  return `AF-${code}`;
}

/** Normaliza o que a pessoa digitou. Vazio vira null: campo opcional. */
export function normalizeAffiliateCode(input: string | null | undefined): string | null {
  const code = (input ?? "").trim().toUpperCase();
  return code || null;
}

export function isAffiliateCodeFormat(code: string): boolean {
  return AFFILIATE_CODE_PATTERN.test(code);
}

/** Comissão em centavos, arredondando meio para cima, só com inteiros. */
export function commissionCents(baseCents: number, bps: number): number {
  if (!Number.isInteger(baseCents) || baseCents < 0) throw new Error("Base inválida");
  if (!Number.isInteger(bps) || bps < 0 || bps > MAX_COMMISSION_BPS) {
    throw new Error("Percentual inválido");
  }
  const product = baseCents * bps;
  if (!Number.isSafeInteger(product)) throw new Error("Base grande demais para o cálculo");
  return Math.floor((product + 5_000) / 10_000);
}

/** Reais decimais do Asaas para centavos, sem herdar o erro de ponto flutuante. */
export function reaisToCents(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

/* ------------------------------------------------------------------------ */
/* Pagamento do Asaas                                                        */
/* ------------------------------------------------------------------------ */

export type AsaasPaymentLike = {
  status?: string | null;
  value?: number | null;
  originalValue?: number | null;
  interestValue?: number | null;
  discount?: { value?: number | null } | null;
  refunds?: { status?: string | null; value?: number | null }[] | null;
};

export type PaymentClass = "paid" | "held" | "refunded" | "unpaid" | "unknown";

const CLASS_BY_STATUS: Record<string, PaymentClass> = {
  CONFIRMED: "paid",
  RECEIVED: "paid",
  RECEIVED_IN_CASH: "paid",
  DUNNING_RECEIVED: "paid",
  // contestação ou devolução em andamento: o dinheiro pode voltar
  CHARGEBACK_REQUESTED: "held",
  CHARGEBACK_DISPUTE: "held",
  AWAITING_CHARGEBACK_REVERSAL: "held",
  REFUND_REQUESTED: "held",
  REFUND_IN_PROGRESS: "held",
  REFUNDED: "refunded",
  PENDING: "unpaid",
  OVERDUE: "unpaid",
  AWAITING_RISK_ANALYSIS: "unpaid",
  DUNNING_REQUESTED: "unpaid",
};

export function classifyPaymentStatus(status: string | null | undefined): PaymentClass {
  return CLASS_BY_STATUS[status ?? ""] ?? "unknown";
}

/** Eventos que podem mudar o direito de comissão. Os demais não pedem consulta ao gateway. */
export const AFFILIATE_RELEVANT_EVENTS = new Set([
  "PAYMENT_CONFIRMED",
  "PAYMENT_RECEIVED",
  "PAYMENT_DUNNING_RECEIVED",
  "PAYMENT_REFUNDED",
  "PAYMENT_PARTIALLY_REFUNDED",
  "PAYMENT_REFUND_IN_PROGRESS",
  "PAYMENT_REFUND_DENIED",
  "PAYMENT_RECEIVED_IN_CASH_UNDONE",
  "PAYMENT_CHARGEBACK_REQUESTED",
  "PAYMENT_CHARGEBACK_DISPUTE",
  "PAYMENT_AWAITING_CHARGEBACK_REVERSAL",
  "PAYMENT_DELETED",
  "PAYMENT_RESTORED",
]);

export type BaseResult = { baseCents: number } | { review: string };

/**
 * Base comissionável: o que foi pago depois de desconto, sem juros e multa,
 * antes da tarifa do Asaas (por isso nunca `netValue`).
 *
 * Pago com atraso, o Asaas põe o valor cheio em `value` e o original em
 * `originalValue`. Quando o desconto existe e o gateway não diz se foi usado,
 * não dá para saber a base — vai para revisão em vez de chutar.
 */
export function asaasCommissionBase(payment: AsaasPaymentLike): BaseResult {
  const value = reaisToCents(payment.value);
  if (value === null || value <= 0) return { review: "Pagamento sem valor positivo" };

  const original = reaisToCents(payment.originalValue);
  const interest = reaisToCents(payment.interestValue) ?? 0;

  if (original !== null && original !== value) {
    if (interest > 0) {
      const base = value - interest;
      return base > 0 ? { baseCents: base } : { review: "Encargos maiores que o valor pago" };
    }
    // abaixo do original sem encargo: desconto aplicado, o valor pago é a base
    if (value < original) return { baseCents: value };
    return { review: "Valor pago acima do original sem encargo informado" };
  }

  if (interest > 0) return { review: "Encargos informados sem valor original" };
  if ((payment.discount?.value ?? 0) > 0 && original === null) {
    return { review: "Cobrança com desconto sem indicação de que foi aplicado" };
  }
  return { baseCents: value };
}

/** Quanto já voltou ao cliente, em centavos. */
export function refundedCentsOf(payment: AsaasPaymentLike, baseCents: number): number {
  if (classifyPaymentStatus(payment.status) === "refunded") return baseCents;
  let total = 0;
  for (const refund of payment.refunds ?? []) {
    if (refund.status !== "DONE") continue;
    total += reaisToCents(refund.value) ?? 0;
  }
  return total;
}

/* ------------------------------------------------------------------------ */
/* Direito de comissão                                                       */
/* ------------------------------------------------------------------------ */

/**
 * Direito líquido de um pagamento no estado atual.
 *
 * Estorno parcial recalcula o direito sobre o que sobrou, em vez de calcular a
 * comissão do valor devolvido: assim vários parciais não acumulam erro de
 * arredondamento e um evento repetido não desconta duas vezes.
 */
export function entitledCents(input: {
  paymentClass: PaymentClass;
  baseCents: number;
  refundedCents: number;
  bps: number;
}): number {
  if (input.paymentClass !== "paid" && input.paymentClass !== "held") return 0;
  const remaining = Math.max(0, input.baseCents - input.refundedCents);
  return commissionCents(remaining, input.bps);
}

/**
 * Ajuste que leva o líquido registrado ao direito atual.
 *
 * A chave junta a quantidade de ajustes já gravados: duas apurações
 * simultâneas do mesmo estado geram a mesma chave e o índice único barra a
 * segunda; um vai-e-volta legítimo (contestação perdida e depois revertida)
 * gera chaves diferentes.
 */
export function nextAdjustment(input: {
  commissionId: string;
  originalCents: number;
  adjustments: number[];
  entitledCents: number;
}): { key: string; amountCents: number } | null {
  const net = input.adjustments.reduce((sum, value) => sum + value, input.originalCents);
  const delta = input.entitledCents - net;
  if (delta === 0) return null;
  return {
    key: `${input.commissionId}:${input.adjustments.length}:${input.entitledCents}`,
    amountCents: delta,
  };
}

/* ------------------------------------------------------------------------ */
/* Percentual na tela                                                        */
/* ------------------------------------------------------------------------ */

export function formatBps(bps: number): string {
  return `${(bps / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

/**
 * "12,5" → 1250. Mais de duas casas devolve null em vez de arredondar: o
 * percentual combinado com o afiliado não pode mudar sem ninguém ver.
 */
export function percentToBps(input: string): number | null {
  const text = input.trim().replace(",", ".");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}
