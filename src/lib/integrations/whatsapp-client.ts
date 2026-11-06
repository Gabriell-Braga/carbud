import { USER_AGENT } from "@/lib/brand";
import { ApiError } from "@/lib/http";
import { toE164Digits } from "./whatsapp-rules";

/**
 * WhatsApp Cloud API, da Meta.
 *
 * A versão fica fixada aqui: a Meta descontinua versões antigas com aviso, e
 * "a mais recente" mudando sozinha significa a integração quebrar num dia em
 * que ninguém mexeu em nada.
 */
const API_VERSION = "v25.0";
const BASE = `https://graph.facebook.com/${API_VERSION}`;

export type WhatsappCredentials = {
  accessToken: string;
  appSecret: string;
  verifyToken: string;
};

async function request<T>(
  path: string,
  token: string,
  body?: unknown,
  method: "GET" | "POST" = "POST",
): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "user-agent": USER_AGENT,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });

  const payload = (await response.json().catch(() => null)) as
    | { error?: { message?: string; error_user_msg?: string; code?: number } }
    | null;

  if (!response.ok) {
    // a Meta traz error_user_msg em português quando existe; é a melhor
    // mensagem para mostrar a quem opera
    const detail =
      payload?.error?.error_user_msg ??
      payload?.error?.message ??
      `a Meta respondeu ${response.status}`;
    throw new ApiError(response.status === 401 ? 502 : 400, `WhatsApp: ${detail}`);
  }

  return payload as T;
}

export type SendResult = { messageId: string };

/**
 * Texto livre. Só funciona dentro da janela de 24 horas.
 *
 * Fora dela a Meta recusa, e é por isso que quem chama precisa consultar a
 * janela antes — o erro dela não é óbvio para quem está vendendo.
 */
export async function sendText(
  phoneNumberId: string,
  token: string,
  to: string,
  text: string,
): Promise<SendResult> {
  const payload = await request<{ messages?: { id: string }[] }>(
    `/${phoneNumberId}/messages`,
    token,
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: toE164Digits(to),
      type: "text",
      text: { preview_url: true, body: text },
    },
  );

  return { messageId: payload.messages?.[0]?.id ?? "" };
}

/**
 * Template aprovado. Único caminho para iniciar conversa.
 *
 * Os parâmetros entram por posição, na ordem em que aparecem no corpo do
 * template registrado na Meta — não por nome. Trocar a ordem manda o texto
 * certo com os dados no lugar errado, e isso chega ao cliente.
 */
export async function sendTemplate(
  phoneNumberId: string,
  token: string,
  to: string,
  templateName: string,
  languageCode: string,
  parameters: string[],
  /** Só para modelo com foto no cabeçalho; a Meta baixa a imagem desta URL. */
  headerImageUrl?: string | null,
): Promise<SendResult> {
  const components: unknown[] = [];
  if (headerImageUrl) {
    components.push({ type: "header", parameters: [{ type: "image", image: { link: headerImageUrl } }] });
  }
  if (parameters.length > 0) {
    components.push({
      type: "body",
      parameters: parameters.map((value) => ({ type: "text", text: value })),
    });
  }

  const payload = await request<{ messages?: { id: string }[] }>(
    `/${phoneNumberId}/messages`,
    token,
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: toE164Digits(to),
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        components,
      },
    },
  );

  return { messageId: payload.messages?.[0]?.id ?? "" };
}

export type MetaTemplate = {
  name: string;
  status: string;
  language: string;
  category: string;
  body: string;
  /** Quantos {{n}} o corpo espera. */
  placeholders: number;
  /** "IMAGE" quando o modelo leva foto no cabeçalho — aí o envio precisa da URL. */
  headerFormat: string | null;
};

/**
 * Templates registrados na conta, com o estado de aprovação.
 *
 * A revenda escreve o texto aqui, mas quem aprova é a Meta — e só o aprovado
 * pode iniciar conversa. Sem esta lista, a tela não teria como dizer por que
 * um modelo não pode ser usado.
 */
export async function listMetaTemplates(
  wabaId: string,
  token: string,
): Promise<MetaTemplate[]> {
  const payload = await request<{
    data?: {
      name: string;
      status: string;
      language: string;
      category: string;
      components?: { type: string; text?: string; format?: string }[];
    }[];
  }>(`/${wabaId}/message_templates?limit=100`, token, undefined, "GET");

  return (payload.data ?? []).map((template) => {
    const body = template.components?.find((part) => part.type === "BODY")?.text ?? "";
    return {
      name: template.name,
      status: template.status,
      language: template.language,
      category: template.category,
      body,
      placeholders: countPlaceholders(body),
      headerFormat: template.components?.find((part) => part.type === "HEADER")?.format ?? null,
    };
  });
}

/** Conta os {{1}}, {{2}}... distintos que o template espera. */
export function countPlaceholders(body: string): number {
  const found = new Set([...body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((match) => match[1]));
  return found.size;
}

/**
 * Confere a assinatura que a Meta manda no webhook.
 *
 * HMAC-SHA256 do corpo CRU com o app secret. Precisa ser o corpo exatamente
 * como chegou: reserializar o JSON muda espaços e ordem e derruba a
 * assinatura de mensagens legítimas.
 */
export async function verifySignature(
  rawBody: string,
  header: string | null,
  appSecret: string,
): Promise<boolean> {
  if (!header?.startsWith("sha256=")) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const expected = [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  const provided = header.slice(7);
  if (provided.length !== expected.length) return false;

  let diff = 0;
  for (let index = 0; index < expected.length; index++) {
    diff |= provided.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return diff === 0;
}
