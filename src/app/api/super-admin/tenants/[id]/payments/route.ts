import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { subscriptions } from "@/db/schema";
import { logAuditFor } from "@/lib/audit";
import { requireApiSuperAdmin } from "@/lib/auth/guards";
import {
  type AsaasEnvironment,
  getPayment,
  isGatewayConfigured,
  listSubscriptionPayments,
  receivePaymentInCash,
} from "@/lib/gateway/asaas";
import { badRequest, conflict, jsonOk, notFound, withApi } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Assinatura no gateway e o ambiente em que ela existe — não o ambiente ativo agora. */
async function gatewaySubscription(
  tenantId: string,
): Promise<{ id: string; environment: AsaasEnvironment }> {
  const db = await getDb();
  const rows = await db
    .select({
      gatewaySubscriptionId: subscriptions.gatewaySubscriptionId,
      gatewayEnvironment: subscriptions.gatewayEnvironment,
    })
    .from(subscriptions)
    .where(eq(subscriptions.tenantId, tenantId))
    .limit(1);

  const id = rows[0]?.gatewaySubscriptionId;
  if (!id) throw notFound("Esta revenda não tem assinatura no gateway");
  const environment = rows[0].gatewayEnvironment ?? "production";
  if (!isGatewayConfigured(environment)) {
    throw badRequest(`Gateway sem chave de ${environment === "production" ? "produção" : "sandbox"}`);
  }
  return { id, environment };
}

/**
 * Cobranças da assinatura, lidas direto do gateway.
 *
 * Evita ter que abrir o painel do Asaas para saber se a cobrança saiu, qual o
 * vencimento e se foi paga.
 */
export const GET = withApi(async (_request: Request, { params }: Params) => {
  await requireApiSuperAdmin("platform:billing:read");
  const { id } = await params;

  const subscription = await gatewaySubscription(id);
  const { data } = await listSubscriptionPayments(subscription.environment, subscription.id);

  return jsonOk({
    environment: subscription.environment,
    payments: data.map((payment) => ({
      id: payment.id,
      status: payment.status,
      valueCents: Math.round(payment.value * 100),
      billingType: payment.billingType,
      dueDate: payment.dueDate,
      paymentDate: payment.paymentDate,
      invoiceUrl: payment.invoiceUrl,
    })),
  });
});

const receiveSchema = z.object({ paymentId: z.string().min(1) });

/**
 * Dá baixa numa cobrança como recebida em dinheiro.
 *
 * No sandbox é o que permite testar o ciclo inteiro sem banco: a baixa dispara
 * o evento e o webhook atualiza a situação da revenda sozinho.
 */
export const POST = withApi(async (request: Request, { params }: Params) => {
  const context = await requireApiSuperAdmin("platform:billing:write");
  const { id } = await params;

  const parsed = receiveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw badRequest("Dados inválidos", parsed.error.issues);

  // confere que a cobrança é mesmo da assinatura desta revenda
  const subscription = await gatewaySubscription(id);
  const { environment } = subscription;
  const { data } = await listSubscriptionPayments(environment, subscription.id);
  const target = data.find((payment) => payment.id === parsed.data.paymentId);
  if (!target) throw notFound("Cobrança não encontrada nesta assinatura");

  if (target.status !== "PENDING" && target.status !== "OVERDUE") {
    throw conflict("Esta cobrança não está em aberto");
  }

  // o Asaas ja devolve o valor em reais; nao ha conversao a fazer aqui
  await receivePaymentInCash(environment, target.id, { value: target.value, date: new Date() });
  const updated = await getPayment(environment, target.id);

  await logAuditFor(
    context,
    {
      action: "billing.payment.receive_in_cash",
      entity: "payment",
      entityId: target.id,
      tenantId: id,
      metadata: { environment, value: target.value },
    },
    request,
  );

  return jsonOk({ id: updated.id, status: updated.status, paymentDate: updated.paymentDate });
});
