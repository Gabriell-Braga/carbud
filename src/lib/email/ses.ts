import { signedHeaders } from "./sigv4";

/**
 * Amazon SES pela API HTTP (v2), não por SMTP.
 *
 * O SES oferece os dois caminhos e eles entregam igual — mas SMTP precisa de
 * socket na porta 587, e o runtime de Workers não tem socket. A API é HTTPS,
 * então funciona. A diferença prática para quem configura na AWS: copia-se
 * uma **chave de acesso** (access key id + secret), não um usuário SMTP.
 *
 * Endpoint: POST https://email.<região>.amazonaws.com/v2/email/outbound-emails
 */

export type SesConfig = {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Remetente verificado no SES, ex.: "Carbud <nao-responda@carbud.com.br>". */
  from: string;
  /** Para onde vai a resposta de quem apertar "responder". */
  replyTo?: string | null;
  /** Conjunto de configuração, quando a conta usa um (opcional). */
  configurationSet?: string | null;
};

export function sesConfigFromEnv(): SesConfig | null {
  const region = process.env.AWS_SES_REGION;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const from = process.env.EMAIL_FROM;

  if (!region || !accessKeyId || !secretAccessKey || !from) return null;

  return {
    region,
    accessKeyId,
    secretAccessKey,
    from,
    replyTo: process.env.EMAIL_REPLY_TO ?? null,
    configurationSet: process.env.AWS_SES_CONFIGURATION_SET ?? null,
  };
}

export function sesPayload(
  config: SesConfig,
  message: { to: string[]; subject: string; html: string; text: string },
) {
  return {
    FromEmailAddress: config.from,
    Destination: { ToAddresses: message.to },
    ...(config.replyTo ? { ReplyToAddresses: [config.replyTo] } : {}),
    ...(config.configurationSet ? { ConfigurationSetName: config.configurationSet } : {}),
    Content: {
      Simple: {
        Subject: { Data: message.subject, Charset: "UTF-8" },
        Body: {
          Html: { Data: message.html, Charset: "UTF-8" },
          Text: { Data: message.text, Charset: "UTF-8" },
        },
      },
    },
  };
}

export type SesResult = { delivered: true } | { delivered: false; reason: string };

export async function sendViaSes(
  config: SesConfig,
  message: { to: string[]; subject: string; html: string; text: string },
  fetcher: typeof fetch = fetch,
): Promise<SesResult> {
  const host = `email.${config.region}.amazonaws.com`;
  const path = "/v2/email/outbound-emails";
  const body = JSON.stringify(sesPayload(config, message));

  try {
    const headers = await signedHeaders({
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        region: config.region,
        service: "ses",
      },
      host,
      path,
      body,
    });

    const response = await fetcher(`https://${host}${path}`, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const detail = (await response.json().catch(() => ({}))) as {
        message?: string;
        Message?: string;
      };
      return {
        delivered: false,
        reason: explain(response.status, detail.message ?? detail.Message ?? ""),
      };
    }
    return { delivered: true };
  } catch (error) {
    return { delivered: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Traduz o erro do SES para o que a pessoa precisa fazer.
 *
 * As três recusas comuns são sempre configuração da conta, não código — e a
 * mensagem crua da AWS não diz o que fazer.
 */
export function explain(status: number, message: string): string {
  const texto = message.toLowerCase();

  if (texto.includes("not verified") || texto.includes("email address is not verified")) {
    return "O SES ainda não confia neste remetente ou destinatário. Verifique o domínio no SES e, enquanto a conta estiver em sandbox, só dá para enviar a endereços verificados.";
  }
  if (status === 403 || texto.includes("signature") || texto.includes("security token")) {
    return "A AWS recusou a credencial. Confira AWS_ACCESS_KEY_ID e AWS_SECRET_ACCESS_KEY, e se a chave tem permissão ses:SendEmail.";
  }
  if (status === 429 || texto.includes("throttl") || texto.includes("rate exceeded")) {
    return "O SES está limitando o envio. Na sandbox são poucos e-mails por segundo; peça a saída da sandbox.";
  }
  return message || `O SES recusou o envio (HTTP ${status}).`;
}
