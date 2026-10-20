/**
 * Cliente do Asaas.
 *
 * Detalhes do provedor que já custaram tempo e estão fixados aqui:
 *  - autenticação é o header `access_token`, não Bearer;
 *  - `User-Agent` é obrigatório para contas criadas depois de 13/06/2024 e o
 *    fetch do runtime de Workers não manda um por padrão — sem isso, TODA
 *    chamada falha parecendo erro de credencial;
 *  - valores vão em reais decimais, não em centavos.
 */

import { USER_AGENT } from "@/lib/brand";
import { ApiError } from "@/lib/http";
import { brazilIsoDate } from "./brazil-date";

const SANDBOX_URL = "https://api-sandbox.asaas.com/v3";
const PRODUCTION_URL = "https://api.asaas.com/v3";

export type AsaasEnvironment = "sandbox" | "production";

/**
 * Falha vinda do gateway.
 *
 * Estende ApiError de proposito: como Error puro, ela caia no ramo generico do
 * jsonError e a pessoa via "Erro interno" enquanto o motivo real — que o Asaas
 * descreve em portugues — ficava so no log do servidor.
 *
 * O status do Asaas nao serve como resposta nossa. 401 dele e credencial
 * NOSSA, nao erro de quem clicou, entao vira 502.
 */
export class AsaasError extends ApiError {
  constructor(
    readonly gatewayStatus: number,
    message: string,
    readonly errors?: { code?: string; description?: string }[],
  ) {
    super(statusFor(gatewayStatus), message, errors);
    this.name = "AsaasError";
  }
}

function statusFor(gatewayStatus: number): number {
  if (gatewayStatus === 400 || gatewayStatus === 422) return 400;
  if (gatewayStatus === 404) return 404;
  return 502;
}

function config(): { baseUrl: string; apiKey: string; environment: AsaasEnvironment } {
  const apiKey = process.env.ASAAS_API_KEY;
  if (!apiKey) throw new AsaasError(500, "ASAAS_API_KEY não configurado");

  // a própria chave diz o ambiente: prod começa com $aact_prod_
  const environment: AsaasEnvironment = apiKey.startsWith("$aact_prod_")
    ? "production"
    : "sandbox";

  const override = process.env.ASAAS_ENV;
  const resolved: AsaasEnvironment =
    override === "production" || override === "sandbox" ? override : environment;

  return {
    apiKey,
    environment: resolved,
    baseUrl: resolved === "production" ? PRODUCTION_URL : SANDBOX_URL,
  };
}

export function asaasEnvironment(): AsaasEnvironment {
  return config().environment;
}

export function isGatewayConfigured(): boolean {
  return Boolean(process.env.ASAAS_API_KEY);
}

async function request<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const { baseUrl, apiKey } = config();

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "user-agent": USER_AGENT,
      access_token: apiKey,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  const payload = text ? safeJson(text) : null;

  if (!response.ok) {
    const errors = (payload as { errors?: { code?: string; description?: string }[] })?.errors;
    // a descricao do Asaas ja vem em portugues e explica o motivo
    const description = errors?.[0]?.description ?? `o gateway respondeu ${response.status}`;
    throw new AsaasError(response.status, `Asaas: ${description}`, errors);
  }

  return payload as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Asaas trabalha em reais decimais. */
export function toReais(cents: number): number {
  return Math.round(cents) / 100;
}

export function toCents(reais: number | string | null | undefined): number {
  const value = typeof reais === "string" ? Number(reais) : (reais ?? 0);
  return Math.round((Number.isFinite(value) ? value : 0) * 100);
}

/** AAAA-MM-DD, formato que o Asaas espera nas datas. */
export function toAsaasDate(date: Date): string {
  // no fuso de Brasília, não em UTC: ver brazil-date.ts
  return brazilIsoDate(date);
}

/* ------------------------------------------------------------------------ */
/* Clientes                                                                  */
/* ------------------------------------------------------------------------ */

export type AsaasCustomerInput = {
  name: string;
  cpfCnpj: string;
  email?: string | null;
  mobilePhone?: string | null;
  postalCode?: string | null;
  address?: string | null;
  addressNumber?: string | null;
  complement?: string | null;
  province?: string | null;
  externalReference: string;
  /** Quando ligado, o Asaas avisa o pagador por e-mail/SMS. */
  notifications: boolean;
};

export type AsaasCustomer = { id: string; name: string; cpfCnpj: string };

/**
 * Telefone no formato que o Asaas aceita: DDD + número, só dígitos.
 *
 * O WhatsApp da loja vem guardado com o 55 do país, e com ele o Asaas recusa
 * o cadastro e ainda manda e-mail de "telefone incorreto" para nós. Número que
 * não fecha com DDD não vai: melhor sem telefone do que barrar a assinatura.
 */
export function toAsaasPhone(value: string | null | undefined): string | undefined {
  let digits = (value ?? "").replace(/\D/g, "");
  if (digits.length > 11 && digits.startsWith("55")) digits = digits.slice(2);
  return digits.length === 10 || digits.length === 11 ? digits : undefined;
}

function customerBody(input: AsaasCustomerInput) {
  return {
    name: input.name,
    cpfCnpj: input.cpfCnpj,
    email: input.email || undefined,
    mobilePhone: toAsaasPhone(input.mobilePhone),
    postalCode: input.postalCode || undefined,
    address: input.address || undefined,
    addressNumber: input.addressNumber || undefined,
    complement: input.complement || undefined,
    province: input.province || undefined,
    externalReference: input.externalReference,
    notificationDisabled: !input.notifications,
  };
}

export function createCustomer(input: AsaasCustomerInput): Promise<AsaasCustomer> {
  return request<AsaasCustomer>("POST", "/customers", customerBody(input));
}

export function updateCustomer(
  customerId: string,
  input: AsaasCustomerInput,
): Promise<AsaasCustomer> {
  return request<AsaasCustomer>("POST", `/customers/${customerId}`, customerBody(input));
}

/* ------------------------------------------------------------------------ */
/* Assinaturas                                                               */
/* ------------------------------------------------------------------------ */

export type AsaasCycle = "MONTHLY" | "QUARTERLY" | "SEMIANNUALLY" | "YEARLY";
export type AsaasBillingType = "BOLETO" | "CREDIT_CARD" | "PIX" | "UNDEFINED";

export type AsaasSubscriptionInput = {
  customerId: string;
  billingType: AsaasBillingType;
  valueCents: number;
  nextDueDate: Date;
  cycle: AsaasCycle;
  description: string;
  externalReference: string;
  /** Multa por atraso, em pontos percentuais. */
  finePercent: number;
  /** Juros de mora ao mês, em pontos percentuais. */
  interestPercent: number;
  discount?: { type: "PERCENTAGE" | "FIXED"; value: number } | null;
};

export type AsaasSubscription = {
  id: string;
  status: string;
  nextDueDate: string;
  value: number;
};

export function createSubscription(input: AsaasSubscriptionInput): Promise<AsaasSubscription> {
  return request<AsaasSubscription>("POST", "/subscriptions", {
    customer: input.customerId,
    billingType: input.billingType,
    value: toReais(input.valueCents),
    nextDueDate: toAsaasDate(input.nextDueDate),
    cycle: input.cycle,
    description: input.description,
    externalReference: input.externalReference,
    fine: { value: input.finePercent },
    interest: { value: input.interestPercent },
    ...(input.discount
      ? { discount: { value: input.discount.value, type: input.discount.type, dueDateLimitDays: 0 } }
      : {}),
  });
}

export function updateSubscription(
  subscriptionId: string,
  changes: Partial<{
    valueCents: number;
    billingType: AsaasBillingType;
    cycle: AsaasCycle;
    nextDueDate: Date;
    description: string;
    status: "ACTIVE" | "INACTIVE";
  }>,
): Promise<AsaasSubscription> {
  return request<AsaasSubscription>("POST", `/subscriptions/${subscriptionId}`, {
    ...(changes.valueCents !== undefined ? { value: toReais(changes.valueCents) } : {}),
    ...(changes.billingType ? { billingType: changes.billingType } : {}),
    ...(changes.cycle ? { cycle: changes.cycle } : {}),
    ...(changes.nextDueDate ? { nextDueDate: toAsaasDate(changes.nextDueDate) } : {}),
    ...(changes.description ? { description: changes.description } : {}),
    ...(changes.status ? { status: changes.status } : {}),
  });
}

export function cancelSubscription(subscriptionId: string): Promise<{ deleted: boolean }> {
  return request<{ deleted: boolean }>("DELETE", `/subscriptions/${subscriptionId}`);
}

/* ------------------------------------------------------------------------ */
/* Webhook                                                                   */
/* ------------------------------------------------------------------------ */

export const WEBHOOK_EVENTS = [
  "PAYMENT_CREATED",
  "PAYMENT_UPDATED",
  "PAYMENT_CONFIRMED",
  "PAYMENT_RECEIVED",
  "PAYMENT_OVERDUE",
  "PAYMENT_DELETED",
  "PAYMENT_RESTORED",
  "PAYMENT_REFUNDED",
  "PAYMENT_CHARGEBACK_REQUESTED",
  "PAYMENT_CHARGEBACK_DISPUTE",
  "PAYMENT_AWAITING_CHARGEBACK_REVERSAL",
] as const;

export type AsaasWebhook = {
  id: string;
  name: string;
  url: string;
  /** O Asaas mostra o token uma única vez, na criação. */
  authToken?: string;
  enabled: boolean;
  /**
   * Fila parada. O Asaas interrompe depois de respostas diferentes de 200 e
   * NÃO reenvia até religarem — com `enabled` ainda true, o que faz o webhook
   * parecer saudável enquanto nada é entregue.
   */
  interrupted?: boolean;
  /** Só os eventos listados aqui são entregues. */
  events?: string[];
  sendType?: string;
};

/**
 * Cria o webhook já com os eventos certos.
 * `authToken` volta só nesta resposta — precisa ser guardado na hora.
 */
export function createWebhook(input: {
  name: string;
  url: string;
  email: string;
  authToken?: string;
}): Promise<AsaasWebhook> {
  return request<AsaasWebhook>("POST", "/webhooks", {
    name: input.name,
    url: input.url,
    email: input.email,
    enabled: true,
    interrupted: false,
    apiVersion: 3,
    sendType: "SEQUENTIALLY",
    events: WEBHOOK_EVENTS,
    ...(input.authToken ? { authToken: input.authToken } : {}),
  });
}

export function listWebhooks(): Promise<{ data: AsaasWebhook[] }> {
  return request<{ data: AsaasWebhook[] }>("GET", "/webhooks");
}

export function getWebhook(webhookId: string): Promise<AsaasWebhook> {
  return request<AsaasWebhook>("GET", `/webhooks/${webhookId}`);
}

/**
 * Religa a entrega e recoloca a lista de eventos.
 *
 * Mandamos `events` junto de propósito: as duas causas de "nada chega" — fila
 * parada e evento não assinado — se resolvem no mesmo lugar, e quem clica não
 * tem por que saber qual das duas era.
 */
export function resumeWebhook(webhookId: string): Promise<AsaasWebhook> {
  return request<AsaasWebhook>("PUT", `/webhooks/${webhookId}`, {
    enabled: true,
    interrupted: false,
    events: WEBHOOK_EVENTS,
  });
}

/* ------------------------------------------------------------------------ */
/* Cobranças                                                                 */
/* ------------------------------------------------------------------------ */

export type AsaasPaymentStatus =
  | "PENDING"
  | "RECEIVED"
  | "CONFIRMED"
  | "OVERDUE"
  | "REFUNDED"
  | "RECEIVED_IN_CASH"
  | "AWAITING_RISK_ANALYSIS";

export type AsaasPayment = {
  id: string;
  status: AsaasPaymentStatus;
  value: number;
  netValue: number | null;
  billingType: AsaasBillingType;
  dueDate: string;
  paymentDate: string | null;
  description: string | null;
  invoiceUrl: string | null;
  bankSlipUrl: string | null;
  transactionReceiptUrl: string | null;
};

/** Cobranças de uma assinatura, da mais recente para a mais antiga. */
export function listSubscriptionPayments(
  subscriptionId: string,
): Promise<{ data: AsaasPayment[] }> {
  return request<{ data: AsaasPayment[] }>(
    "GET",
    `/subscriptions/${subscriptionId}/payments?limit=20`,
  );
}

export function getPayment(paymentId: string): Promise<AsaasPayment> {
  return request<AsaasPayment>("GET", `/payments/${paymentId}`);
}

/**
 * Marca a cobrança como recebida em dinheiro.
 *
 * É como se confirma um pagamento sem passar por banco. No sandbox serve para
 * disparar o evento de pagamento e exercitar o webhook ponta a ponta; em
 * produção é a baixa manual de quem pagou por fora.
 */
export function receivePaymentInCash(
  paymentId: string,
  input: { value: number; date: Date; notifyCustomer?: boolean },
): Promise<AsaasPayment> {
  return request<AsaasPayment>("POST", `/payments/${paymentId}/receiveInCash`, {
    paymentDate: toAsaasDate(input.date),
    value: input.value,
    notifyCustomer: input.notifyCustomer ?? false,
  });
}
