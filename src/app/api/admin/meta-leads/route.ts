import { requireApiTenant } from "@/lib/auth/guards";
import { logAuditFor } from "@/lib/audit";
import { conflict, jsonOk, withApi } from "@/lib/http";
import { isVaultConfigured } from "@/lib/security/vault";
import { connectMetaLeads, disconnectMetaLeads } from "@/lib/services/meta-leads";
import { metaLeadConnectionSchema } from "@/lib/validation/crm";

export const dynamic = "force-dynamic";

export const PUT = withApi(async (request: Request) => {
  const context = await requireApiTenant("tenant:settings");
  if (!isVaultConfigured()) throw conflict("O cofre de credenciais não está configurado");
  const input = metaLeadConnectionSchema.parse(await request.json().catch(() => null));
  await connectMetaLeads(context.tenant.id, input);
  // segredos fora da auditoria: só a página que foi ligada
  await logAuditFor(
    context,
    { action: "meta_leads.connect", entity: "tenant", entityId: context.tenant.id, metadata: { pageId: input.pageId } },
    request,
  );
  return jsonOk({ connected: true });
});

export const DELETE = withApi(async (request: Request) => {
  const context = await requireApiTenant("tenant:settings");
  await disconnectMetaLeads(context.tenant.id);
  await logAuditFor(
    context,
    { action: "meta_leads.disconnect", entity: "tenant", entityId: context.tenant.id },
    request,
  );
  return jsonOk({ connected: false });
});
