import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { tenantSites, tenants, users, type Lead } from "@/db/schema";
import { newLeadEmail, leadAssignedEmail, sendInBackground } from "@/lib/email";
import { withBasePath } from "@/lib/paths";
import { getOrigin } from "@/lib/seo/urls";

/**
 * Avisos por e-mail da operação da revenda.
 *
 * Regras que valem para o arquivo inteiro:
 *
 * - **Nunca derruba quem chamou.** O lead já está salvo quando o aviso sai.
 *   Servidor de e-mail fora do ar não pode fazer o site devolver erro para o
 *   cliente que preencheu o formulário.
 * - **Sem destinatário, não faz nada.** Revenda que não configurou e-mail de
 *   aviso e não tem vendedor atribuído simplesmente não recebe — e o lead
 *   continua na tela, como sempre esteve.
 */

/** Quem recebe os avisos, e o que a revenda ligou. */
export type NotificationSettings = {
  /** Avisar por e-mail quando entra lead. Desligado por padrão. */
  newLead?: boolean;
  /** Endereços fixos que recebem todo lead (gerência, central). */
  leadRecipients?: string[];
  /** Avisar também o vendedor responsável, no e-mail de acesso dele. */
  notifyAssignee?: boolean;
};

export async function getNotificationSettings(
  tenantId: string,
): Promise<NotificationSettings> {
  const db = await getDb();
  const rows = await db
    .select({ notifications: tenantSites.notifications })
    .from(tenantSites)
    .where(eq(tenantSites.tenantId, tenantId))
    .limit(1);

  return rows[0]?.notifications ?? {};
}

/**
 * Para quem mandar o aviso de um lead.
 *
 * O vendedor responsável vem primeiro porque é dele o atendimento; os
 * endereços fixos existem para quem quer a gerência copiada em tudo. Sem
 * rodízio ligado e sem endereço fixo, a lista sai vazia — e nada é enviado.
 */
async function leadRecipients(
  tenantId: string,
  assignedToUserId: string | null,
  settings: NotificationSettings,
): Promise<{ addresses: string[]; assigneeName: string | null }> {
  const addresses = new Set<string>();
  let assigneeName: string | null = null;

  if (assignedToUserId && settings.notifyAssignee !== false) {
    const db = await getDb();
    const found = await db
      .select({ email: users.email, name: users.name })
      .from(users)
      .where(
        and(
          eq(users.id, assignedToUserId),
          eq(users.tenantId, tenantId),
          eq(users.status, "active"),
        ),
      )
      .limit(1);

    if (found[0]) {
      addresses.add(found[0].email);
      assigneeName = found[0].name;
    }
  }

  for (const address of settings.leadRecipients ?? []) {
    const limpo = address.trim().toLowerCase();
    if (limpo) addresses.add(limpo);
  }

  return { addresses: [...addresses], assigneeName };
}

async function tenantName(tenantId: string): Promise<string> {
  const db = await getDb();
  const rows = await db
    .select({ name: tenants.name })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  return rows[0]?.name ?? "Sua revenda";
}

/** Aviso de lead novo, venha do site ou de um portal. */
export async function notifyNewLead(input: {
  tenantId: string;
  lead: Pick<
    Lead,
    "id" | "name" | "phone" | "email" | "message" | "vehicleLabel" | "assignedToUserId"
  >;
  /** "site", "Mercado Livre", "OLX Autos"… aparece no corpo do aviso. */
  origin: string;
}): Promise<void> {
  const settings = await getNotificationSettings(input.tenantId);
  if (!settings.newLead) return;

  const { addresses, assigneeName } = await leadRecipients(
    input.tenantId,
    input.lead.assignedToUserId,
    settings,
  );
  if (addresses.length === 0) return;

  const origin = await getOrigin();

  await sendInBackground({
    to: addresses,
    ...newLeadEmail({
      leadName: input.lead.name,
      phone: input.lead.phone || null,
      email: input.lead.email,
      message: input.lead.message,
      vehicleLabel: input.lead.vehicleLabel,
      origin: input.origin,
      url: `${origin}${withBasePath(`/admin/leads/${input.lead.id}`)}`,
      tenantName: await tenantName(input.tenantId),
      assignedTo: assigneeName,
    }),
  });
}

/**
 * Aviso de lead que passou a ser de alguém.
 *
 * Vai só para quem recebeu, e não para a lista toda: a gerência já foi
 * avisada quando o lead entrou, e repetir tudo a cada troca de responsável
 * treina a equipe a ignorar o aviso.
 */
export async function notifyLeadAssigned(input: {
  tenantId: string;
  lead: Pick<Lead, "id" | "name" | "phone" | "email" | "message" | "vehicleLabel">;
  assignedToUserId: string;
}): Promise<void> {
  const settings = await getNotificationSettings(input.tenantId);
  if (!settings.newLead || settings.notifyAssignee === false) return;

  const db = await getDb();
  const found = await db
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(
      and(
        eq(users.id, input.assignedToUserId),
        eq(users.tenantId, input.tenantId),
        eq(users.status, "active"),
      ),
    )
    .limit(1);
  if (!found[0]) return;

  const origin = await getOrigin();

  await sendInBackground({
    to: found[0].email,
    ...leadAssignedEmail({
      leadName: input.lead.name,
      phone: input.lead.phone || null,
      email: input.lead.email,
      message: input.lead.message,
      vehicleLabel: input.lead.vehicleLabel,
      origin: "atribuído a você",
      url: `${origin}${withBasePath(`/admin/leads/${input.lead.id}`)}`,
      tenantName: await tenantName(input.tenantId),
      assignedTo: found[0].name,
    }),
  });
}

/** Endereços da equipe, para a tela de avisos sugerir quem cadastrar. */
export async function teamEmails(tenantId: string): Promise<string[]> {
  const db = await getDb();
  const rows = await db
    .select({ email: users.email })
    .from(users)
    .where(
      and(
        eq(users.tenantId, tenantId),
        eq(users.status, "active"),
        inArray(users.role, ["revenda_admin", "vendedor"]),
      ),
    );
  return rows.map((row) => row.email);
}
