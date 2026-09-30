import { sessionSecretKey } from "@/lib/auth/session";
import { onlyDigits } from "@/lib/utils";

/**
 * A porta de entrada de leads que vale para QUALQUER portal.
 *
 * O Mercado Livre avisa sozinho e a gente busca a pergunta pela API dele.
 * Os outros portais não oferecem isso da mesma forma — o que praticamente
 * todos oferecem é mandar o lead para um endereço que a loja cadastra lá
 * dentro (a "URL de leads", às vezes por um integrador no meio). Este módulo
 * é essa porta: uma URL por revenda e por portal, que aceita o formato de
 * cada um e entrega sempre a mesma coisa para o CRM.
 *
 * Sem ela, "leads de todos os portais" dependeria de escrever um adaptador
 * por portal antes de ter acesso à API de cada um — e, até lá, o lead da OLX
 * continuaria só no e-mail de quem vende.
 */

/** O que o CRM precisa, venha de onde vier. */
export type IncomingPortalLead = {
  portal: string;
  /**
   * Quem é esta pessoa na origem. É o que decide lead novo x pergunta nova
   * no mesmo lead. Quando o portal manda um id de lead, é ele; senão,
   * anúncio + telefone/e-mail, que é o que identifica a mesma pessoa.
   */
  externalId: string;
  name: string;
  phone: string | null;
  email: string | null;
  message: string | null;
  /**
   * Identidade DESTA mensagem, quando existe (a pergunta no ML, o protocolo
   * do lead). É o que impede a mesma frase de entrar duas vezes na linha do
   * tempo quando o portal reavisa. Sem ela, o próprio texto serve de marca.
   */
  messageId?: string | null;
  /** Id do anúncio no portal, para achar o carro no nosso estoque. */
  adExternalId: string | null;
  /**
   * Placa do carro do anúncio, sem traço. Serve quando o anúncio não saiu
   * da nossa fila de publicação (o Webmotors), e o id dele não casa com nada.
   */
  plate?: string | null;
  /** Endereço do anúncio ou da conversa, para responder de lá. */
  url: string | null;
};

/* ------------------------------------------------------------------------ */
/* Token da URL                                                              */
/* ------------------------------------------------------------------------ */

/**
 * O token é derivado, não guardado.
 *
 * Assinar `<revenda>:<portal>` com o AUTH_SECRET dá uma URL estável, que a
 * tela pode mostrar de novo a qualquer momento, sem coluna nova no banco e
 * sem segredo em claro em lugar nenhum. Quem tiver a URL só consegue criar
 * lead naquela revenda e naquele portal — é o mesmo poder de quem preenche o
 * formulário do site, e por isso ela é limitada por taxa como ele.
 *
 * Rotacionar = rotacionar o AUTH_SECRET (e recadastrar as URLs nos portais).
 */
async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    sessionSecretKey().buffer as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return base64Url(new Uint8Array(signature));
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function leadInboxToken(tenantId: string, portal: string): Promise<string> {
  return `${tenantId}.${await sign(`portal-lead:${tenantId}:${portal}`)}`;
}

/**
 * Confere o token e devolve de qual revenda ele é.
 *
 * A comparação é de tempo constante: comparar com `===` vaza, pelo tempo,
 * quantos caracteres do começo estão certos — é o suficiente para descobrir
 * a assinatura byte a byte.
 */
export async function tenantFromLeadToken(
  token: string,
  portal: string,
): Promise<string | null> {
  const cut = token.indexOf(".");
  if (cut <= 0) return null;

  const tenantId = token.slice(0, cut);
  const provided = token.slice(cut + 1);
  const expected = await sign(`portal-lead:${tenantId}:${portal}`);

  if (provided.length !== expected.length) return null;
  let diff = 0;
  for (let index = 0; index < expected.length; index++) {
    diff |= provided.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return diff === 0 ? tenantId : null;
}

/* ------------------------------------------------------------------------ */
/* Leitura do corpo                                                          */
/* ------------------------------------------------------------------------ */

/**
 * Cada portal batiza os campos do seu jeito, e não há padrão no mercado.
 *
 * Em vez de um adaptador por portal para renomear quatro campos, aceitamos os
 * nomes que aparecem na prática — em português e em inglês, em camelCase e em
 * snake_case. O que não reconhecemos não impede o lead de entrar: nome e
 * (telefone ou e-mail) bastam, o resto entra na mensagem.
 */
const ALIASES = {
  name: ["name", "nome", "nome_cliente", "customerName", "customer_name", "buyer_name", "lead_name", "contact_name"],
  phone: ["phone", "telefone", "celular", "fone", "phoneNumber", "phone_number", "mobile", "whatsapp", "contact_phone"],
  email: ["email", "e-mail", "e_mail", "mail", "customerEmail", "customer_email", "contact_email"],
  message: ["message", "mensagem", "comentario", "comentário", "comment", "text", "texto", "observacao", "observação", "description"],
  ad: ["adId", "ad_id", "anuncio", "anuncio_id", "anuncioId", "listingId", "listing_id", "externalId", "external_id", "itemId", "item_id", "vehicleId", "vehicle_id", "codigo_anuncio"],
  url: ["url", "link", "permalink", "ad_url", "adUrl", "anuncio_url"],
  id: ["id", "leadId", "lead_id", "protocolo", "protocol", "reference", "referencia"],
} as const;

type RawBody = Record<string, unknown>;

/** Procura o primeiro alias presente, inclusive dentro de um objeto aninhado. */
function pick(body: RawBody, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = body[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }

  /*
   * Vários portais embrulham o lead: { lead: {...} }, { data: {...} },
   * { contact: {...} }. Um nível de profundidade cobre o que se vê na
   * prática sem virar uma busca cega pelo corpo inteiro.
   */
  for (const nested of ["lead", "data", "contact", "cliente", "comprador", "buyer", "payload"]) {
    const inner = body[nested];
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      const found = pick(inner as RawBody, keys);
      if (found) return found;
    }
  }
  return null;
}

export type NormalizeResult =
  | { ok: true; lead: IncomingPortalLead }
  | { ok: false; reason: string };

export function normalizeInboundLead(portal: string, body: unknown): NormalizeResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, reason: "Corpo vazio ou fora de formato: esperado um objeto JSON." };
  }
  const raw = body as RawBody;

  const phoneRaw = pick(raw, ALIASES.phone);
  const phone = phoneRaw ? onlyDigits(phoneRaw) : "";
  const email = pick(raw, ALIASES.email)?.toLowerCase() ?? null;
  const name = pick(raw, ALIASES.name);

  // sem uma forma de responder, o lead não serve para quem vende
  if (!phone && !email) {
    return { ok: false, reason: "Informe ao menos telefone ou e-mail de quem procurou." };
  }

  const adExternalId = pick(raw, ALIASES.ad);
  const providedId = pick(raw, ALIASES.id);

  return {
    ok: true,
    lead: {
      portal,
      externalId: providedId
        ? `${portal}:lead:${providedId}`
        : `${portal}:${adExternalId ?? "sem-anuncio"}:${phone || email}`,
      name: name || "Contato sem nome",
      phone: phone || null,
      email,
      message: pick(raw, ALIASES.message),
      messageId: providedId,
      adExternalId,
      url: pick(raw, ALIASES.url),
    },
  };
}
