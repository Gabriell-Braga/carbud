import { logAuditFor } from "@/lib/audit";
import { parsePatch } from "@/lib/validation/patch";
import { requireApiTenant } from "@/lib/auth/guards";
import { requireFeature } from "@/lib/api/feature-guard";
import { badRequest, jsonOk, notFound, withApi } from "@/lib/http";
import { deleteTenantWebhook, updateTenantWebhook } from "@/lib/services/api-access";
import { tenantWebhookSchema } from "@/lib/validation/crm";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const PATCH = withApi(async (request: Request, { params }: Params) => {
  const context = await requireApiTenant("api:manage");
  await requireFeature(context.tenant.id, "api_webhooks");
  const { id } = await params;

  const parsed = parsePatch(tenantWebhookSchema, await request.json().catch(() => null));
  if (!parsed.success) throw badRequest("Dados inválidos", parsed.error.issues);

  const ok = await updateTenantWebhook(context.tenant.id, id, parsed.data);
  if (!ok) throw notFound("Webhook não encontrado");

  await logAuditFor(context, { action: "webhook.update", entity: "tenant_webhook", entityId: id }, request);
  return jsonOk({ id });
});

export const DELETE = withApi(async (request: Request, { params }: Params) => {
  const context = await requireApiTenant("api:manage");
  await requireFeature(context.tenant.id, "api_webhooks");
  const { id } = await params;

  const ok = await deleteTenantWebhook(context.tenant.id, id);
  if (!ok) throw notFound("Webhook não encontrado");

  await logAuditFor(context, { action: "webhook.delete", entity: "tenant_webhook", entityId: id }, request);
  return jsonOk({ deleted: true });
});
