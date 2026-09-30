import { ApiError } from "@/lib/http";
import { onlyDigits } from "@/lib/utils";
import type { IncomingPortalLead } from "./portal-lead-inbox";
import type { PortalApp } from "./portal-apps";

/**
 * Webmotors: leads pela API do integrador (Sensedia).
 *
 * São três peças, e só a primeira é da revenda:
 *
 * 1. A loja cria no Cockpit um usuário com perfil "Integrador de API" (um por
 *    loja) e ativa "Integração com CRM de terceiros" na aba Integrações. O
 *    e-mail e a senha desse usuário são o que ela informa aqui.
 * 2. O nosso app no portal de desenvolvedores (Client ID e Secret, no
 *    ambiente) tem UMA "CALLBACK URL LEADS", que vale para todas as lojas.
 * 3. A cada lead, o Webmotors chama essa URL só com os ids
 *    (`IdLead`, `CodigoCliente`, `Cnpj`, `IdTipoLead`). O conteúdo — nome,
 *    telefone, mensagem, anúncio — buscamos na API com o token daquela loja.
 *
 * O aviso não é assinado. O que protege é o passo 3: um aviso forjado só nos
 * faz perguntar ao Webmotors por um lead que a loja não tem, e nada entra.
 *
 * Referência: https://portal-webmotors.sensedia.com/api-portal/documentacao/consultar-leads-webmotors
 * A publicação de anúncios não tem API pública; ela não está aqui.
 */

/**
 * Homologação é o padrão porque é onde o app nasce: o Webmotors libera
 * produção depois de aprovar os testes, e informa o endereço junto.
 */
const HOMOLOG_API = "https://hlg-webmotors.sensedia.com";

export function webmotorsApiBase(): string {
  return (process.env.WEBMOTORS_API_URL || HOMOLOG_API).replace(/\/+$/, "");
}

/* ------------------------------------------------------------------------ */
/* Aviso de lead (CALLBACK URL LEADS)                                        */
/* ------------------------------------------------------------------------ */

export type WebmotorsLeadNotice = {
  leadId: string;
  /** Código da loja no Webmotors. */
  clientCode: string | null;
  /** Só dígitos. É por ele que achamos a revenda. */
  cnpj: string | null;
  /** 1 = ligação, 2 = proposta, 11 e 12 = WhatsApp. A API de detalhe exige. */
  leadType: string;
};

function field(raw: Record<string, unknown>, ...names: string[]): string | null {
  for (const name of names) {
    const value = raw[name];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}

/** Lê o corpo do aviso; devolve null para o que não é do Webmotors. */
export function parseLeadNotice(body: unknown): WebmotorsLeadNotice | null {
  if (!body || typeof body !== "object") return null;
  const raw = body as Record<string, unknown>;

  const leadId = field(raw, "IdLead", "idLead", "id_lead");
  const leadType = field(raw, "IdTipoLead", "idTipoLead", "id_tipo_lead");
  if (!leadId || !leadType) return null;

  const cnpj = field(raw, "Cnpj", "cnpj", "CNPJ");
  return {
    leadId,
    clientCode: field(raw, "CodigoCliente", "codigoCliente", "codigo_cliente"),
    cnpj: cnpj ? onlyDigits(cnpj) : null,
    leadType,
  };
}

/* ------------------------------------------------------------------------ */
/* Detalhe do lead                                                           */
/* ------------------------------------------------------------------------ */

type Json = Record<string, unknown>;

function asObject(value: unknown): Json | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null;
}

/**
 * O detalhe às vezes vem embrulhado (`Retorno`, `data`), às vezes não. A
 * documentação pública mostra os campos, não o envelope.
 */
function unwrap(body: unknown): Json | null {
  const root = asObject(body);
  if (!root) return null;
  for (const key of ["Retorno", "retorno", "data", "lead"]) {
    const inner = asObject(root[key]);
    if (inner) return inner;
  }
  return root;
}

/**
 * Quem procurou. Nome, e-mail e telefone podem estar na raiz ou num objeto
 * do comprador; `loja`, `vendedor` e `anuncio` também têm `nome` e `id`, e
 * por isso ficam de fora da busca.
 */
function buyer(detail: Json): Json {
  for (const key of ["cliente", "comprador", "contato", "interessado", "consumidor"]) {
    const inner = asObject(detail[key]);
    if (inner) return inner;
  }
  return detail;
}

function text(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number") return String(value);
  return null;
}

/** A mensagem pode ser texto ou uma lista de mensagens da conversa. */
function messageText(value: unknown): string | null {
  if (Array.isArray(value)) {
    const parts = value
      .map((item) => text(item) ?? text(asObject(item)?.mensagem) ?? text(asObject(item)?.texto))
      .filter((part): part is string => Boolean(part));
    return parts.length ? parts.join("\n") : null;
  }
  return text(value);
}

export function parseLeadDetail(body: unknown, notice: WebmotorsLeadNotice): IncomingPortalLead {
  const detail = unwrap(body) ?? {};
  const person = buyer(detail);
  const ad = asObject(detail.anuncio);

  const phone = text(person.telefone) ?? text(person.celular) ?? text(person.fone);
  const kind = text(detail.tipoLeadDesc);
  const message = messageText(detail.mensagem) ?? messageText(detail.mensagens);
  const plate = text(ad?.placa);

  return {
    portal: "webmotors",
    // um lead do Webmotors é uma conversa; o id dele é a identidade aqui
    externalId: `webmotors:${notice.leadId}`,
    name: text(person.nome) ?? "",
    phone: phone ? onlyDigits(phone) || null : null,
    email: text(person.email),
    message: [kind, message].filter(Boolean).join(": ") || null,
    messageId: notice.leadId,
    adExternalId: text(ad?.id),
    plate: plate ? plate.replace(/[^a-z0-9]/gi, "").toUpperCase() : null,
    url: null,
  };
}

/* ------------------------------------------------------------------------ */
/* Cliente HTTP                                                              */
/* ------------------------------------------------------------------------ */

export type WebmotorsLogin = { username: string; password: string };

/**
 * Token da loja: o nosso app (Basic) + o usuário "Integrador de API" dela.
 *
 * Erro de senha é o caso comum aqui, e a resposta do Sensedia não diz isso
 * em português — a frase abaixo diz onde conferir.
 */
export async function webmotorsToken(app: PortalApp, login: WebmotorsLogin): Promise<string> {
  const response = await fetch(`${webmotorsApiBase()}/oauth/v1/access-token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${app.clientId}:${app.clientSecret}`)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      username: login.username,
      password: login.password,
      grant_type: "password",
    }),
  });

  const body = (await response.json().catch(() => null)) as Json | null;
  const token = text(body?.access_token);
  if (!response.ok || !token) {
    if (response.status === 400 || response.status === 401 || response.status === 403) {
      throw new ApiError(
        400,
        'O Webmotors recusou o e-mail e a senha. Confira no Cockpit, em Usuários, se o usuário tem o perfil "Integrador de API" e está ativo.',
      );
    }
    throw new ApiError(502, `Webmotors não respondeu ao login (HTTP ${response.status}).`);
  }
  return token;
}

export async function fetchLeadDetail(
  app: PortalApp,
  token: string,
  notice: WebmotorsLeadNotice,
): Promise<unknown> {
  const url = `${webmotorsApiBase()}/lead/v1/leads/${encodeURIComponent(
    notice.leadId,
  )}?id_tipo_lead=${encodeURIComponent(notice.leadType)}`;
  const response = await fetch(url, {
    headers: { client_id: app.clientId, access_token: token, "Content-Type": "application/json" },
  });
  if (!response.ok) {
    throw new ApiError(
      502,
      `Webmotors não entregou o lead ${notice.leadId} (HTTP ${response.status}).`,
    );
  }
  return response.json();
}
