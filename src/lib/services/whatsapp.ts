import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { leadEvents, leads, whatsappConnections, type WhatsappConnection } from "@/db/schema";
import { badRequest, conflict } from "@/lib/http";
import { open, seal } from "@/lib/security/vault";
import {
  sendTemplate,
  sendText,
  type WhatsappCredentials,
} from "@/lib/integrations/whatsapp-client";
import {
  isOptOutMessage,
  isWindowOpen,
  phoneVariants,
  type InboundMessage,
} from "@/lib/integrations/whatsapp-rules";
import { listStages, pickAssignee } from "@/lib/services/crm";

export async function getWhatsappConnection(
  tenantId: string,
): Promise<WhatsappConnection | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(whatsappConnections)
    .where(eq(whatsappConnections.tenantId, tenantId))
    .limit(1);
  return rows[0] ?? null;
}

export async function connectWhatsapp(
  tenantId: string,
  userId: string | null,
  input: {
    phoneNumberId: string;
    wabaId?: string | null;
    displayPhone?: string | null;
  } & WhatsappCredentials,
): Promise<void> {
  const db = await getDb();
  const credentials = await seal(
    JSON.stringify({
      accessToken: input.accessToken,
      appSecret: input.appSecret,
      verifyToken: input.verifyToken,
    }),
  );

  const values = {
    phoneNumberId: input.phoneNumberId.trim(),
    wabaId: input.wabaId?.trim() || null,
    displayPhone: input.displayPhone?.trim() || null,
    credentials,
    status: "conectado",
    lastError: null,
    connectedByUserId: userId,
  };

  const existing = await getWhatsappConnection(tenantId);
  if (existing) {
    await db
      .update(whatsappConnections)
      .set(values)
      .where(eq(whatsappConnections.tenantId, tenantId));
    return;
  }
  await db.insert(whatsappConnections).values({ tenantId, ...values });
}

export async function disconnectWhatsapp(tenantId: string): Promise<void> {
  const db = await getDb();
  await db.delete(whatsappConnections).where(eq(whatsappConnections.tenantId, tenantId));
}

export async function readWhatsappCredentials(
  connection: WhatsappConnection,
): Promise<WhatsappCredentials> {
  return JSON.parse(await open(connection.credentials)) as WhatsappCredentials;
}

/* ------------------------------------------------------------------------ */
/* Janela por lead                                                           */
/* ------------------------------------------------------------------------ */

/**
 * Quando o cliente falou pela última vez NESTE lead.
 *
 * A janela é por conversa, não por revenda: um cliente respondendo agora não
 * abre janela para todos os outros leads da loja.
 */
export async function lastInboundAt(tenantId: string, leadId: string): Promise<Date | null> {
  const db = await getDb();
  const rows = await db
    .select({ createdAt: leadEvents.createdAt })
    .from(leadEvents)
    .where(
      and(
        eq(leadEvents.tenantId, tenantId),
        eq(leadEvents.leadId, leadId),
        eq(leadEvents.direction, "in"),
      ),
    )
    .orderBy(desc(leadEvents.createdAt))
    .limit(1);
  return rows[0]?.createdAt ?? null;
}

export type SendOutcome = {
  mode: "texto_livre" | "template";
  messageId: string;
};

/**
 * Manda a mensagem pelo caminho que a Meta permite naquele instante.
 *
 * Dentro da janela vai texto livre — o que o vendedor escreveu, do jeito que
 * escreveu. Fora dela, só template aprovado, e sem template não há como
 * iniciar: falhar aqui com explicação é melhor do que a Meta recusar com um
 * código que ninguém entende.
 */
export async function sendToLead(
  tenantId: string,
  leadId: string,
  input: {
    text: string;
    templateName?: string | null;
    templateLanguage?: string | null;
    templateParameters?: string[];
  },
  actor: { userId: string | null; userName: string | null },
): Promise<SendOutcome> {
  const connection = await getWhatsappConnection(tenantId);
  if (!connection) throw conflict("WhatsApp não está conectado nesta revenda");

  const db = await getDb();
  const leadRows = await db
    .select({ phone: leads.phone })
    .from(leads)
    .where(and(eq(leads.tenantId, tenantId), eq(leads.id, leadId)))
    .limit(1);
  const lead = leadRows[0];
  if (!lead) throw badRequest("Lead não encontrado");

  const credentials = await readWhatsappCredentials(connection);
  const open24h = isWindowOpen(await lastInboundAt(tenantId, leadId));

  let result: { messageId: string };
  let mode: SendOutcome["mode"];

  if (open24h) {
    mode = "texto_livre";
    result = await sendText(
      connection.phoneNumberId,
      credentials.accessToken,
      lead.phone,
      input.text,
    );
  } else {
    if (!input.templateName) {
      throw badRequest(
        "Faz mais de 24 horas desde a última mensagem do cliente. Só um modelo aprovado pela Meta pode reabrir a conversa.",
      );
    }
    mode = "template";
    result = await sendTemplate(
      connection.phoneNumberId,
      credentials.accessToken,
      lead.phone,
      input.templateName,
      input.templateLanguage || "pt_BR",
      input.templateParameters ?? [],
    );
  }

  await db.insert(leadEvents).values({
    tenantId,
    leadId,
    type: "whatsapp",
    direction: "out",
    externalId: result.messageId || null,
    body: input.text,
    userId: actor.userId,
    userName: actor.userName,
    metadata: { mode },
  });

  return { mode, messageId: result.messageId };
}

/* ------------------------------------------------------------------------ */
/* Entrada                                                                   */
/* ------------------------------------------------------------------------ */

export async function connectionByPhoneNumberId(
  phoneNumberId: string,
): Promise<WhatsappConnection | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(whatsappConnections)
    .where(eq(whatsappConnections.phoneNumberId, phoneNumberId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Registra a mensagem do cliente e devolve o lead a que ela pertence.
 *
 * Procura por todas as grafias do telefone porque a Meta manda ora com o nono
 * dígito, ora sem. Sem correspondência, cria um lead novo: cliente que escreve
 * é oportunidade, e deixá-lo fora do CRM porque nunca preencheu formulário
 * seria perder exatamente quem tomou a iniciativa.
 */
export async function receiveInbound(
  tenantId: string,
  message: InboundMessage,
): Promise<{ leadId: string; duplicate: boolean }> {
  const db = await getDb();

  // a Meta reenvia a entrega até receber 200; o id da mensagem evita registrar
  // a mesma conversa duas vezes
  const seen = await db
    .select({ leadId: leadEvents.leadId })
    .from(leadEvents)
    .where(
      and(eq(leadEvents.tenantId, tenantId), eq(leadEvents.externalId, message.externalId)),
    )
    .limit(1);
  if (seen[0]) return { leadId: seen[0].leadId, duplicate: true };

  const variants = phoneVariants(message.from);
  const found = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(eq(leads.tenantId, tenantId), inArray(leads.phone, variants)))
    .orderBy(desc(leads.createdAt))
    .limit(1);

  let leadId = found[0]?.id;

  if (!leadId) {
    const stages = await listStages(tenantId);
    const firstStage = stages.find((stage) => stage.kind === "open") ?? stages[0] ?? null;

    const created = await db
      .insert(leads)
      .values({
        tenantId,
        name: message.senderName ?? "Contato pelo WhatsApp",
        phone: message.from,
        message: message.text,
        source: "whatsapp",
        status: "new",
        stageId: firstStage?.id ?? null,
        assignedToUserId: await pickAssignee(tenantId, null),
      })
      .returning({ id: leads.id });
    leadId = created[0].id;
  }

  await db.insert(leadEvents).values({
    tenantId,
    leadId,
    type: "whatsapp",
    direction: "in",
    externalId: message.externalId,
    body: message.text,
    userName: message.senderName,
    metadata: { from: message.from },
  });

  if (isOptOutMessage(message.text)) {
    await db
      .update(leads)
      .set({ marketingOptOutAt: new Date() })
      .where(and(eq(leads.tenantId, tenantId), eq(leads.id, leadId)));
  }

  await db
    .update(whatsappConnections)
    .set({ lastInboundAt: message.timestamp })
    .where(eq(whatsappConnections.tenantId, tenantId));

  return { leadId, duplicate: false };
}
