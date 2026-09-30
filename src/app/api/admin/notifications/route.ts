import { z } from "zod";
import { getDb } from "@/db";
import { tenantSites, type NotificationSettings } from "@/db/schema";
import { logAuditFor } from "@/lib/audit";
import { requireApiTenant } from "@/lib/auth/guards";
import { badRequest, conflict, jsonOk, withApi } from "@/lib/http";
import { isEmailConfigured, sendEmail, newLeadEmail } from "@/lib/email";
import { getEmailCopy } from "@/lib/email/copy-store";
import { withBasePath } from "@/lib/paths";
import { getOrigin } from "@/lib/seo/urls";
import { getNotificationSettings } from "@/lib/services/notifications";

export const dynamic = "force-dynamic";

const schema = z.object({
  newLead: z.boolean().optional(),
  notifyAssignee: z.boolean().optional(),
  /**
   * Endereços fixos, limpos antes de salvar.
   *
   * Vazio é um estado legítimo: a revenda que só quer avisar o vendedor
   * responsável não cadastra nenhum.
   */
  leadRecipients: z
    .array(z.string().trim().toLowerCase().email("Endereço inválido"))
    .max(10, "No máximo 10 endereços")
    .optional(),
});

export const PATCH = withApi(async (request: Request) => {
  const context = await requireApiTenant("tenant:settings");

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw badRequest("Dados inválidos", parsed.error.issues);

  const current = await getNotificationSettings(context.tenant.id);
  const settings: NotificationSettings = {
    ...current,
    ...parsed.data,
    leadRecipients: parsed.data.leadRecipients ?? current.leadRecipients ?? [],
  };

  const db = await getDb();
  await db
    .insert(tenantSites)
    .values({ tenantId: context.tenant.id, notifications: settings })
    .onConflictDoUpdate({
      target: tenantSites.tenantId,
      set: { notifications: settings },
    });

  await logAuditFor(
    context,
    {
      action: "notifications.update",
      entity: "tenant",
      entityId: context.tenant.id,
      metadata: {
        newLead: settings.newLead,
        notifyAssignee: settings.notifyAssignee,
        destinatarios: settings.leadRecipients?.length ?? 0,
      },
    },
    request,
  );

  return jsonOk({ saved: true });
});

/**
 * E-mail de teste, com um lead de mentira.
 *
 * Sem isso, a única forma de saber se o aviso chega seria esperar um lead de
 * verdade — e, se não chegasse, ninguém saberia se o problema é a
 * configuração, o domínio ou a caixa de spam de quem recebe.
 */
export const POST = withApi(async () => {
  const context = await requireApiTenant("tenant:settings");
  if (!isEmailConfigured()) {
    throw conflict("Nenhum provedor de e-mail configurado nesta instalação.");
  }

  const settings = await getNotificationSettings(context.tenant.id);
  const to = [context.user.email, ...(settings.leadRecipients ?? [])];

  const origin = await getOrigin();
  const result = await sendEmail({
    to,
    ...newLeadEmail(
      {
        leadName: "Lead de teste",
        phone: "(31) 99999-0000",
        email: "teste@carbud.com.br",
        message: "Mensagem de teste. Se você recebeu isto, o aviso está funcionando.",
        vehicleLabel: "Veículo de exemplo 2024",
        origin: "teste",
        url: `${origin}${withBasePath("/admin/leads")}`,
        tenantName: context.tenant.name,
      },
      await getEmailCopy("newLead"),
    ),
  });

  if (!result.delivered) throw conflict(result.reason ?? "Não consegui enviar.");
  return jsonOk({ sent: to });
});
