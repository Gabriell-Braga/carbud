import { and, desc, eq, gte, inArray, isNull, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import {
  campaignRecipients,
  campaigns,
  leadEvents,
  leads,
  tenants,
  vehicles,
  type CampaignAudience,
  type LeadNegotiation,
  type LeadSource,
  type LeadStatus,
} from "@/db/schema";
import { listMetaTemplates, sendTemplate, type MetaTemplate } from "@/lib/integrations/whatsapp-client";
import { badRequest, conflict, notFound } from "@/lib/http";
import { getOrigin } from "@/lib/seo/urls";
import { pictureUrls } from "@/lib/services/portal-sync-shared";
import { teamMemberIds } from "@/lib/services/teams";
import { getWhatsappConnection, readWhatsappCredentials } from "@/lib/services/whatsapp";

/**
 * Teto de destinatários por campanha.
 *
 * ponytail: a lista é gravada linha a linha na criação; acima disso a criação
 * fica lenta no D1. Se alguma revenda precisar de mais, gravar em INSERT ...
 * SELECT direto no banco em vez de passar pelo Worker.
 */
export const MAX_RECIPIENTS = 2000;

/** Quantos envios por chamada. A tela chama de novo até acabar. */
const BATCH_SIZE = 20;

export const CAMPAIGN_TOKENS = ["{nome}", "{veiculo}", "{revenda}"] as const;

export type TokenContext = {
  name: string;
  vehicleLabel: string | null;
  negotiation: LeadNegotiation | null;
  tenantName: string;
};

/**
 * Troca {nome}, {veiculo} e {revenda} pelos dados do lead.
 *
 * Nunca devolve vazio: a Meta recusa parâmetro em branco, e um cliente sem
 * carro na ficha derrubaria o envio para ele. O que falta vira uma expressão
 * neutra que ainda cabe na frase.
 */
export function resolveParameter(value: string, context: TokenContext): string {
  const firstName = context.name.trim().split(/\s+/)[0] ?? "";
  const fromSheet = [context.negotiation?.brand, context.negotiation?.model]
    .filter(Boolean)
    .join(" ");
  const resolved = value
    .replaceAll("{nome}", firstName || "cliente")
    .replaceAll("{veiculo}", fromSheet || context.vehicleLabel || "seu próximo carro")
    .replaceAll("{revenda}", context.tenantName)
    .trim();
  return resolved || "-";
}

/** Condições da lista. Opt-out e sem telefone ficam de fora sempre. */
async function audienceWhere(tenantId: string, audience: CampaignAudience): Promise<SQL | null> {
  const conditions: SQL[] = [
    eq(leads.tenantId, tenantId),
    ne(leads.phone, ""),
    isNull(leads.marketingOptOutAt),
  ];
  if (audience.statuses?.length) {
    conditions.push(inArray(leads.status, audience.statuses as LeadStatus[]));
  }
  if (audience.sources?.length) {
    conditions.push(inArray(leads.source, audience.sources as LeadSource[]));
  }
  if (audience.createdFrom) {
    conditions.push(gte(leads.createdAt, new Date(`${audience.createdFrom}T00:00:00-03:00`)));
  }
  if (audience.createdTo) {
    conditions.push(lte(leads.createdAt, new Date(`${audience.createdTo}T23:59:59.999-03:00`)));
  }
  if (audience.interest?.trim()) {
    const term = `%${audience.interest.trim().toLowerCase()}%`;
    // procura no carro vinculado e no que o cliente disse querer na ficha
    conditions.push(
      or(
        sql`lower(coalesce(${leads.vehicleLabel}, '')) like ${term}`,
        sql`lower(coalesce(json_extract(${leads.negotiation}, '$.brand'), '') || ' ' || coalesce(json_extract(${leads.negotiation}, '$.model'), '')) like ${term}`,
      )!,
    );
  }
  if (audience.teamId) {
    const members = await teamMemberIds(tenantId, audience.teamId);
    if (members.length === 0) return null;
    conditions.push(inArray(leads.assignedToUserId, members));
  }
  return and(...conditions)!;
}

export async function previewAudience(tenantId: string, audience: CampaignAudience) {
  const where = await audienceWhere(tenantId, audience);
  if (!where) return { total: 0, sample: [] as string[] };
  const db = await getDb();
  // mesmo telefone em dois leads recebe uma vez só
  const [total, sample] = await Promise.all([
    db.select({ value: sql<number>`count(distinct ${leads.phone})` }).from(leads).where(where),
    db.select({ name: leads.name }).from(leads).where(where).orderBy(desc(leads.createdAt)).limit(5),
  ]);
  return { total: Number(total[0]?.value ?? 0), sample: sample.map((row) => row.name) };
}

/** Modelos aprovados na Meta — só eles podem abrir conversa. */
export async function approvedTemplates(tenantId: string): Promise<MetaTemplate[]> {
  const connection = await getWhatsappConnection(tenantId);
  if (!connection) throw conflict("WhatsApp não está conectado nesta revenda");
  if (!connection.wabaId) {
    throw conflict("Falta o ID da conta do WhatsApp Business na conexão. Reconecte em Mensagens.");
  }
  const credentials = await readWhatsappCredentials(connection);
  const templates = await listMetaTemplates(connection.wabaId, credentials.accessToken);
  return templates.filter((template) => template.status === "APPROVED");
}

export async function createCampaign(
  tenantId: string,
  input: {
    name: string;
    purpose: string;
    audience: CampaignAudience;
    templateName: string;
    templateLanguage: string;
    parameters: string[];
    vehicleId?: string | null;
  },
  actor: { userId: string; userName: string },
) {
  const template = (await approvedTemplates(tenantId)).find(
    (item) => item.name === input.templateName && item.language === input.templateLanguage,
  );
  if (!template) throw badRequest("Modelo não encontrado ou ainda não aprovado pela Meta");
  if (input.parameters.length !== template.placeholders) {
    throw badRequest(`O modelo espera ${template.placeholders} variável(is)`);
  }

  const db = await getDb();
  let headerImageUrl: string | null = null;
  if (template.headerFormat === "IMAGE") {
    if (!input.vehicleId) throw badRequest("Este modelo leva foto: escolha o carro da foto");
    const owned = await db
      .select({ id: vehicles.id })
      .from(vehicles)
      .where(and(eq(vehicles.tenantId, tenantId), eq(vehicles.id, input.vehicleId)))
      .limit(1);
    if (!owned[0]) throw badRequest("Veículo inválido");
    headerImageUrl = (await pictureUrls(input.vehicleId, await getOrigin()))[0] ?? null;
    if (!headerImageUrl) throw badRequest("O carro escolhido não tem foto");
  }

  const where = await audienceWhere(tenantId, input.audience);
  const rows = where
    ? await db
        .select({ id: leads.id, phone: leads.phone })
        .from(leads)
        .where(where)
        .orderBy(desc(leads.createdAt))
        .limit(MAX_RECIPIENTS * 2)
    : [];

  // o lead mais recente de cada telefone representa a pessoa
  const seen = new Set<string>();
  const leadIds: string[] = [];
  for (const row of rows) {
    if (seen.has(row.phone)) continue;
    seen.add(row.phone);
    leadIds.push(row.id);
  }
  if (leadIds.length === 0) throw badRequest("Ninguém na lista com esses filtros");
  if (leadIds.length > MAX_RECIPIENTS) {
    throw badRequest(`A lista passa de ${MAX_RECIPIENTS} pessoas. Aperte os filtros.`);
  }

  const created = await db
    .insert(campaigns)
    .values({
      tenantId,
      name: input.name,
      purpose: input.purpose,
      audience: input.audience,
      headerImageUrl,
      templateName: template.name,
      templateLanguage: template.language,
      templateBody: template.body,
      parameters: input.parameters,
      total: leadIds.length,
      createdByUserId: actor.userId,
      createdByName: actor.userName,
    })
    .returning({ id: campaigns.id });
  const campaignId = created[0].id;

  // D1 limita parâmetros por instrução; 20 linhas de 4 colunas cabem folgado
  for (let index = 0; index < leadIds.length; index += 20) {
    await db.insert(campaignRecipients).values(
      leadIds.slice(index, index + 20).map((leadId) => ({ tenantId, campaignId, leadId })),
    );
  }

  return campaignId;
}

export async function listCampaigns(tenantId: string) {
  const db = await getDb();
  return db
    .select()
    .from(campaigns)
    .where(eq(campaigns.tenantId, tenantId))
    .orderBy(desc(campaigns.createdAt))
    .limit(50);
}

async function loadCampaign(tenantId: string, id: string) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.tenantId, tenantId), eq(campaigns.id, id)))
    .limit(1);
  if (!rows[0]) throw notFound("Campanha não encontrada");
  return rows[0];
}

async function refreshCounters(tenantId: string, campaignId: string) {
  const db = await getDb();
  const rows = await db
    .select({ status: campaignRecipients.status, total: sql<number>`count(*)` })
    .from(campaignRecipients)
    .where(eq(campaignRecipients.campaignId, campaignId))
    .groupBy(campaignRecipients.status);
  const count = (status: string) => Number(rows.find((row) => row.status === status)?.total ?? 0);
  const pending = count("pending");
  await db
    .update(campaigns)
    .set({ sent: count("sent"), failed: count("failed") + count("skipped") })
    .where(and(eq(campaigns.tenantId, tenantId), eq(campaigns.id, campaignId)));
  return { sent: count("sent"), failed: count("failed"), skipped: count("skipped"), pending };
}

/**
 * Envia o próximo lote.
 *
 * Em lotes porque o Worker tem teto de chamadas externas por requisição: a
 * tela chama de novo enquanto houver pendente. Cada envio vira mensagem na
 * linha do tempo do lead — quando o cliente responder, o vendedor vê o que
 * foi mandado.
 */
export async function sendNextBatch(tenantId: string, campaignId: string) {
  const campaign = await loadCampaign(tenantId, campaignId);
  if (campaign.status === "canceled" || campaign.status === "done") {
    return { status: campaign.status, ...(await refreshCounters(tenantId, campaignId)) };
  }

  const connection = await getWhatsappConnection(tenantId);
  if (!connection) throw conflict("WhatsApp não está conectado nesta revenda");
  const credentials = await readWhatsappCredentials(connection);

  const db = await getDb();
  if (campaign.status === "draft") {
    await db
      .update(campaigns)
      .set({ status: "sending", startedAt: new Date() })
      .where(eq(campaigns.id, campaignId));
  }

  const tenant = await db
    .select({ name: tenants.name })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  const tenantName = tenant[0]?.name ?? "";

  const batch = await db
    .select({
      recipientId: campaignRecipients.id,
      leadId: leads.id,
      name: leads.name,
      phone: leads.phone,
      vehicleLabel: leads.vehicleLabel,
      negotiation: leads.negotiation,
      optOut: leads.marketingOptOutAt,
    })
    .from(campaignRecipients)
    .innerJoin(leads, eq(leads.id, campaignRecipients.leadId))
    .where(
      and(eq(campaignRecipients.campaignId, campaignId), eq(campaignRecipients.status, "pending")),
    )
    .limit(BATCH_SIZE);

  for (const row of batch) {
    // pode ter pedido para sair depois que a lista foi montada
    if (row.optOut) {
      await db
        .update(campaignRecipients)
        .set({ status: "skipped", error: "Pediu para não receber" })
        .where(eq(campaignRecipients.id, row.recipientId));
      continue;
    }

    const context = { name: row.name, vehicleLabel: row.vehicleLabel, negotiation: row.negotiation, tenantName };
    const parameters = campaign.parameters.map((value) => resolveParameter(value, context));
    try {
      const result = await sendTemplate(
        connection.phoneNumberId,
        credentials.accessToken,
        row.phone,
        campaign.templateName,
        campaign.templateLanguage,
        parameters,
        campaign.headerImageUrl,
      );
      await db
        .update(campaignRecipients)
        .set({ status: "sent", sentAt: new Date(), error: null })
        .where(eq(campaignRecipients.id, row.recipientId));
      await db.insert(leadEvents).values({
        tenantId,
        leadId: row.leadId,
        type: "whatsapp",
        direction: "out",
        externalId: result.messageId || null,
        body: fillBody(campaign.templateBody ?? campaign.templateName, parameters),
        userName: `Campanha: ${campaign.name}`,
        metadata: { mode: "template", campaignId },
      });
    } catch (error) {
      await db
        .update(campaignRecipients)
        .set({
          status: "failed",
          error: (error instanceof Error ? error.message : String(error)).slice(0, 300),
        })
        .where(eq(campaignRecipients.id, row.recipientId));
    }
  }

  const counters = await refreshCounters(tenantId, campaignId);
  const status = counters.pending === 0 ? "done" : "sending";
  if (status === "done") {
    await db
      .update(campaigns)
      .set({ status: "done", finishedAt: new Date() })
      .where(eq(campaigns.id, campaignId));
  }
  return { status, ...counters };
}

/** Texto do modelo com as variáveis preenchidas, para a linha do tempo. */
export function fillBody(body: string, parameters: string[]): string {
  return body.replace(/\{\{\s*(\d+)\s*\}\}/g, (match, index) => parameters[Number(index) - 1] ?? match);
}

export async function cancelCampaign(tenantId: string, campaignId: string) {
  await loadCampaign(tenantId, campaignId);
  const db = await getDb();
  await db
    .update(campaignRecipients)
    .set({ status: "skipped", error: "Campanha cancelada" })
    .where(
      and(eq(campaignRecipients.campaignId, campaignId), eq(campaignRecipients.status, "pending")),
    );
  await db
    .update(campaigns)
    .set({ status: "canceled", finishedAt: new Date() })
    .where(and(eq(campaigns.tenantId, tenantId), eq(campaigns.id, campaignId)));
  await refreshCounters(tenantId, campaignId);
}
