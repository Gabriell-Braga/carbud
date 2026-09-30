import { logAuditFor } from "@/lib/audit";
import { requireApiSuperAdmin } from "@/lib/auth/guards";
import { getEmailCopyOverrides, saveEmailCopy } from "@/lib/email/copy-store";
import { badRequest, jsonOk, withApi } from "@/lib/http";
import { emailTemplateSchema } from "@/lib/validation/email";

export const dynamic = "force-dynamic";

export const GET = withApi(async () => {
  await requireApiSuperAdmin("platform:billing:read");
  return jsonOk(await getEmailCopyOverrides());
});

/**
 * Grava os textos de um modelo, ou volta ao padrão com `copy: null`.
 *
 * Vale para o próximo envio: não há fila de e-mail com texto congelado. A
 * auditoria leva o texto inteiro porque "quem mudou o aviso de lead, e para
 * quê" é a pergunta que aparece quando uma revenda estranha a mensagem.
 */
export const PUT = withApi(async (request: Request) => {
  const context = await requireApiSuperAdmin("platform:billing:write");

  const parsed = emailTemplateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw badRequest("Dados inválidos", parsed.error.issues);

  const saved = await saveEmailCopy(parsed.data.key, parsed.data.copy);

  await logAuditFor(
    context,
    {
      action: saved ? "platform.email_template.update" : "platform.email_template.reset",
      entity: "platform_settings",
      entityId: parsed.data.key,
      metadata: { template: parsed.data.key, copy: saved },
    },
    request,
  );

  return jsonOk({ key: parsed.data.key, copy: saved });
});
