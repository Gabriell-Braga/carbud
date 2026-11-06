import { USER_AGENT } from "@/lib/brand";
import { ApiError } from "@/lib/http";

/**
 * Anúncios de cadastro (Lead Ads) do Facebook e do Instagram.
 *
 * A Meta avisa por webhook só o id do cadastro; os dados vêm numa segunda
 * chamada, com o token da página. É assim por desenho deles: o webhook não
 * carrega dado pessoal.
 */
const API_VERSION = "v25.0";

export type LeadgenNotice = { pageId: string; leadgenId: string; formId: string | null; adId: string | null };

/** Tira do webhook os avisos de cadastro; o resto (comentário, post) é ignorado. */
export function parseLeadgenNotices(payload: unknown): LeadgenNotice[] {
  const notices: LeadgenNotice[] = [];
  const entries = (payload as { object?: string; entry?: unknown[] })?.entry;
  if ((payload as { object?: string })?.object !== "page" || !Array.isArray(entries)) return notices;

  for (const entry of entries as { id?: string; changes?: { field?: string; value?: Record<string, unknown> }[] }[]) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "leadgen") continue;
      const value = change.value ?? {};
      const leadgenId = value.leadgen_id ? String(value.leadgen_id) : "";
      const pageId = String(value.page_id ?? entry.id ?? "");
      if (!leadgenId || !pageId) continue;
      notices.push({
        pageId,
        leadgenId,
        formId: value.form_id ? String(value.form_id) : null,
        adId: value.ad_id ? String(value.ad_id) : null,
      });
    }
  }
  return notices;
}

export type LeadgenField = { name: string; values: string[] };

export type MappedLead = { name: string; phone: string; email: string | null; message: string | null };

const NAME_FIELDS = ["full_name", "nome_completo", "nome"];
const PHONE_FIELDS = ["phone_number", "telefone", "celular", "whatsapp"];
const EMAIL_FIELDS = ["email", "e-mail"];

/**
 * Formulário da Meta para o formato do lead.
 *
 * Os campos padrão (nome, telefone, e-mail) têm nome fixo; as perguntas que a
 * loja criou ("tem carro na troca?") chegam com o texto que ela escreveu e
 * viram a mensagem do lead, para o vendedor ler tudo de uma vez.
 */
export function mapLeadgenFields(fields: LeadgenField[]): MappedLead {
  const pick = (names: string[]) =>
    fields.find((field) => names.includes(field.name.toLowerCase()))?.values?.[0]?.trim() ?? "";

  const first = pick(["first_name", "primeiro_nome"]);
  const last = pick(["last_name", "sobrenome"]);
  const name = pick(NAME_FIELDS) || [first, last].filter(Boolean).join(" ");

  const known = new Set([...NAME_FIELDS, ...PHONE_FIELDS, ...EMAIL_FIELDS, "first_name", "last_name", "primeiro_nome", "sobrenome"]);
  const extras = fields
    .filter((field) => !known.has(field.name.toLowerCase()))
    .map((field) => `${field.name.replace(/_/g, " ")}: ${field.values.join(", ")}`);

  return {
    name: name || "Contato do anúncio",
    phone: pick(PHONE_FIELDS),
    email: pick(EMAIL_FIELDS).toLowerCase() || null,
    message: extras.length > 0 ? extras.join("\n") : null,
  };
}

export async function fetchLeadgen(
  leadgenId: string,
  pageToken: string,
): Promise<{ fields: LeadgenField[]; campaignName: string | null; adName: string | null }> {
  const url = new URL(`https://graph.facebook.com/${API_VERSION}/${encodeURIComponent(leadgenId)}`);
  url.searchParams.set("fields", "field_data,form_id,ad_name,campaign_name");
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${pageToken}`, "user-agent": USER_AGENT },
  });
  const payload = (await response.json().catch(() => ({}))) as {
    field_data?: LeadgenField[];
    ad_name?: string;
    campaign_name?: string;
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new ApiError(502, payload.error?.message ?? `Meta respondeu ${response.status}`);
  }
  return {
    fields: payload.field_data ?? [],
    campaignName: payload.campaign_name ?? null,
    adName: payload.ad_name ?? null,
  };
}
