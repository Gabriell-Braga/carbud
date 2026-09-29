import { sendViaSes, sesConfigFromEnv } from "./ses";

/**
 * Envio de e-mail transacional.
 *
 * Dois provedores, escolhidos pelo que estiver configurado:
 *
 * 1. **Amazon SES** pela API HTTP, quando `AWS_SES_REGION`,
 *    `AWS_ACCESS_KEY_ID` e `AWS_SECRET_ACCESS_KEY` existem.
 * 2. **Resend**, quando `RESEND_API_KEY` existe.
 *
 * Nenhum dos dois usa SMTP, e não é escolha de gosto: o painel roda em
 * Cloudflare Workers, onde não há socket para a porta 587. Os dois falam
 * HTTPS, que é o que sai de lá.
 *
 * Sem provedor nenhum, `sendEmail` devolve `delivered: false` e quem chamou
 * decide o plano B — na redefinição de senha, o link é entregue pelo Painel
 * Geral. Nenhum fluxo do produto quebra por falta de e-mail.
 */

export type EmailResult = { delivered: boolean; reason?: string };

export type EmailMessage = {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
};

export type EmailProvider = "ses" | "resend" | null;

export function emailProvider(): EmailProvider {
  if (sesConfigFromEnv()) return "ses";
  if (process.env.RESEND_API_KEY && process.env.EMAIL_FROM) return "resend";
  return null;
}

export function isEmailConfigured(): boolean {
  return emailProvider() !== null;
}

export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  const to = (Array.isArray(message.to) ? message.to : [message.to])
    .map((address) => address.trim())
    .filter(Boolean);
  if (to.length === 0) return { delivered: false, reason: "sem destinatário" };

  const ses = sesConfigFromEnv();
  if (ses) {
    const result = await sendViaSes(ses, { ...message, to });
    if (!result.delivered) console.error("[email] SES recusou:", result.reason);
    return result.delivered ? { delivered: true } : { delivered: false, reason: result.reason };
  }

  if (process.env.RESEND_API_KEY && process.env.EMAIL_FROM) {
    return sendViaResend(to, message);
  }

  return { delivered: false, reason: "provedor não configurado" };
}

async function sendViaResend(to: string[], message: EmailMessage): Promise<EmailResult> {
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("[email] Resend recusou:", response.status, detail.slice(0, 200));
      return { delivered: false, reason: `provedor respondeu ${response.status}` };
    }
    return { delivered: true };
  } catch (error) {
    console.error("[email] erro de rede:", error);
    return { delivered: false, reason: "erro de rede" };
  }
}

/**
 * Manda sem segurar quem chamou.
 *
 * Salvar um lead não pode esperar a resposta de um servidor de e-mail. No
 * Cloudflare o `waitUntil` mantém o worker vivo depois do retorno; fora dele
 * (dev, testes) espera mesmo, para o comportamento continuar observável.
 */
export async function sendInBackground(message: EmailMessage): Promise<void> {
  const job = sendEmail(message).then(
    () => undefined,
    (error) => console.error("[email] falhou", error),
  );

  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const context = await getCloudflareContext({ async: true });
    context.ctx.waitUntil(job);
  } catch {
    await job;
  }
}

export * from "./templates";
