import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { leads, metaLeadConnections, type MetaLeadConnection } from "@/db/schema";
import { fetchLeadgen, mapLeadgenFields, type LeadgenNotice } from "@/lib/integrations/meta-leads";
import { open, seal } from "@/lib/security/vault";
import { dispatchTenantEvent } from "@/lib/services/api-access";
import { listStages, pickAssignee, recordLeadEvent } from "@/lib/services/crm";
import { notifyNewLead } from "@/lib/services/notifications";

export type MetaLeadCredentials = { pageAccessToken: string; appSecret: string; verifyToken: string };

export async function getMetaLeadConnection(tenantId: string): Promise<MetaLeadConnection | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(metaLeadConnections)
    .where(eq(metaLeadConnections.tenantId, tenantId))
    .limit(1);
  return rows[0] ?? null;
}

export async function connectMetaLeads(
  tenantId: string,
  input: { pageId: string; pageName?: string | null } & MetaLeadCredentials,
) {
  const db = await getDb();
  const values = {
    pageId: input.pageId.trim(),
    pageName: input.pageName?.trim() || null,
    credentials: await seal(
      JSON.stringify({
        pageAccessToken: input.pageAccessToken,
        appSecret: input.appSecret,
        verifyToken: input.verifyToken,
      }),
    ),
    lastError: null,
  };
  if (await getMetaLeadConnection(tenantId)) {
    await db.update(metaLeadConnections).set(values).where(eq(metaLeadConnections.tenantId, tenantId));
    return;
  }
  await db.insert(metaLeadConnections).values({ tenantId, ...values });
}

export async function disconnectMetaLeads(tenantId: string) {
  const db = await getDb();
  await db.delete(metaLeadConnections).where(eq(metaLeadConnections.tenantId, tenantId));
}

export async function readMetaLeadCredentials(connection: MetaLeadConnection): Promise<MetaLeadCredentials> {
  return JSON.parse(await open(connection.credentials)) as MetaLeadCredentials;
}

export async function connectionByPageId(pageId: string): Promise<MetaLeadConnection | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(metaLeadConnections)
    .where(eq(metaLeadConnections.pageId, pageId))
    .limit(1);
  return rows[0] ?? null;
}

export async function listMetaLeadConnections(): Promise<MetaLeadConnection[]> {
  const db = await getDb();
  return db.select().from(metaLeadConnections);
}

/**
 * Busca o cadastro na Meta e grava como lead.
 *
 * O id do cadastro vira `externalId`: a Meta reenvia o webhook até receber
 * 200, e sem essa trava cada reenvio criaria um lead repetido.
 */
export async function receiveLeadgen(
  connection: MetaLeadConnection,
  notice: LeadgenNotice,
): Promise<"created" | "duplicate"> {
  const tenantId = connection.tenantId;
  const externalId = `meta:${notice.leadgenId}`;
  const db = await getDb();

  const existing = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(eq(leads.tenantId, tenantId), eq(leads.externalId, externalId)))
    .limit(1);
  if (existing[0]) return "duplicate";

  const credentials = await readMetaLeadCredentials(connection);
  const fetched = await fetchLeadgen(notice.leadgenId, credentials.pageAccessToken);
  const mapped = mapLeadgenFields(fetched.fields);

  const stages = await listStages(tenantId);
  const firstStage = stages.find((stage) => stage.kind === "open") ?? stages[0] ?? null;
  const assignedToUserId = await pickAssignee(tenantId, null);

  const created = await db
    .insert(leads)
    .values({
      tenantId,
      name: mapped.name,
      phone: mapped.phone,
      email: mapped.email,
      message: mapped.message,
      source: "meta_ads",
      status: "new",
      stageId: firstStage?.id ?? null,
      assignedToUserId,
      externalId,
      utm: {
        source: "facebook",
        medium: "lead_ads",
        ...(fetched.campaignName ? { campaign: fetched.campaignName } : {}),
        ...(fetched.adName ? { content: fetched.adName } : {}),
      },
    })
    .returning({ id: leads.id });
  const leadId = created[0].id;

  await recordLeadEvent({
    tenantId,
    leadId,
    type: "created",
    body: fetched.adName ? `Cadastro do anúncio "${fetched.adName}".` : "Cadastro de anúncio do Facebook/Instagram.",
    metadata: { source: "meta_ads", leadgenId: notice.leadgenId, formId: notice.formId },
  });

  await db
    .update(metaLeadConnections)
    .set({ lastLeadAt: new Date(), lastError: null })
    .where(eq(metaLeadConnections.tenantId, tenantId));

  // conversão não vai para a Meta de novo: o lead nasceu lá e ela já contou
  await notifyNewLead({
    tenantId,
    lead: {
      id: leadId,
      name: mapped.name,
      phone: mapped.phone,
      email: mapped.email,
      message: mapped.message,
      vehicleLabel: null,
      assignedToUserId,
    },
    origin: "anúncio do Facebook/Instagram",
  });

  await dispatchTenantEvent(tenantId, "lead.created", {
    id: leadId,
    name: mapped.name,
    phone: mapped.phone,
    email: mapped.email,
    source: "meta_ads",
  });

  return "created";
}

export async function recordMetaLeadFailure(tenantId: string, error: unknown) {
  try {
    const db = await getDb();
    await db
      .update(metaLeadConnections)
      .set({ lastError: error instanceof Error ? error.message : String(error) })
      .where(eq(metaLeadConnections.tenantId, tenantId));
  } catch {
    // registrar a falha não pode gerar outra
  }
}
