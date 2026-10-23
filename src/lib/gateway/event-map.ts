import type { BillingStatus } from "@/db/schema";
import type { SubscriptionStatus } from "@/db/schema";

/**
 * Tradução de evento do Asaas para o nosso estado.
 *
 * Função pura de propósito: é a regra mais delicada da integração (decide
 * quem fica sem site) e precisa ser testável sem tocar em banco nem em rede.
 *
 * Repare que nada aqui bloqueia nada. Só grava a situação — quem corta acesso
 * continua sendo `effectiveBillingStatus()`, com a tolerância configurada.
 */
export type EventOutcome = {
  /** Situação financeira a gravar; `undefined` mantém a atual. */
  billingStatus?: BillingStatus;
  /** Situação da assinatura; `undefined` mantém a atual. */
  subscriptionStatus?: SubscriptionStatus;
  /** Registra pagamento recebido e empurra o próximo vencimento. */
  registersPayment?: boolean;
  /** Texto para o histórico financeiro. */
  note: string;
  /** Eventos meramente informativos não mexem em acesso. */
  informational?: boolean;
};

const MAP: Record<string, EventOutcome> = {
  // ------------------------------------------------------------- recebimento
  PAYMENT_CONFIRMED: {
    billingStatus: "adimplente",
    subscriptionStatus: "active",
    registersPayment: true,
    note: "Pagamento confirmado pelo gateway.",
  },
  PAYMENT_RECEIVED: {
    billingStatus: "adimplente",
    subscriptionStatus: "active",
    registersPayment: true,
    note: "Pagamento recebido pelo gateway.",
  },

  // ------------------------------------------------------------ inadimplência
  PAYMENT_OVERDUE: {
    billingStatus: "inadimplente",
    subscriptionStatus: "past_due",
    note: "Cobrança vencida sem pagamento.",
  },

  // --------------------------------------------------- devolução e contestação
  PAYMENT_REFUNDED: {
    billingStatus: "inadimplente",
    subscriptionStatus: "past_due",
    note: "Pagamento estornado.",
  },
  PAYMENT_CHARGEBACK_REQUESTED: {
    billingStatus: "inadimplente",
    subscriptionStatus: "past_due",
    note: "Chargeback solicitado pelo cliente.",
  },
  PAYMENT_CHARGEBACK_DISPUTE: {
    note: "Chargeback em disputa.",
    informational: true,
  },
  PAYMENT_AWAITING_CHARGEBACK_REVERSAL: {
    note: "Aguardando reversão de chargeback.",
    informational: true,
  },

  // -------------------------------------------------------------- informativos
  PAYMENT_CREATED: { note: "Cobrança gerada.", informational: true },
  PAYMENT_UPDATED: { note: "Cobrança alterada.", informational: true },
  PAYMENT_DELETED: { note: "Cobrança removida no gateway.", informational: true },
  PAYMENT_RESTORED: { note: "Cobrança restaurada no gateway.", informational: true },
};

export function mapAsaasEvent(eventType: string): EventOutcome | null {
  return MAP[eventType] ?? null;
}

/**
 * CONFIRMED e RECEIVED da mesma cobrança são um pagamento só. Sem isto, cartão
 * (que confirma num dia e recebe semanas depois) empurrava o vencimento duas
 * vezes, e a revenda ganhava um mês de graça.
 */
export function outcomeForPayment(
  outcome: EventOutcome,
  samePaymentAlreadyRegistered: boolean,
): EventOutcome {
  if (!outcome.registersPayment || !samePaymentAlreadyRegistered) return outcome;
  return { ...outcome, registersPayment: false, note: `${outcome.note} Cobrança já registrada.` };
}

export function isKnownEvent(eventType: string): boolean {
  return eventType in MAP;
}

/** Próximo vencimento a partir do ciclo contratado. */
export function advanceDueDate(from: Date, cycle: string): Date {
  const next = new Date(from.getTime());
  const months = { MONTHLY: 1, QUARTERLY: 3, SEMIANNUALLY: 6, YEARLY: 12 }[cycle] ?? 1;
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}
