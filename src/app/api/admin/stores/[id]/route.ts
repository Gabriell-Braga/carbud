import { invalidateTenantCache } from "@/lib/tenant/service";
import { logAuditFor } from "@/lib/audit";
import { parsePatch } from "@/lib/validation/patch";
import { requireApiTenant } from "@/lib/auth/guards";
import { requireFeature } from "@/lib/api/feature-guard";
import { badRequest, jsonOk, withApi } from "@/lib/http";
import { deleteStore, updateStore } from "@/lib/services/stores";
import { storeSchema } from "@/lib/validation/crm";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const PATCH = withApi(async (request: Request, { params }: Params) => {
  const context = await requireApiTenant("stores:write");
  await requireFeature(context.tenant.id, "gestao_multiunidade");
  const { id } = await params;

  const parsed = parsePatch(storeSchema, await request.json().catch(() => null));
  if (!parsed.success) throw badRequest("Dados inválidos", parsed.error.issues);

  await updateStore(context.tenant.id, id, {
    ...parsed.data,
    // só mexe no e-mail se ele veio; antes, qualquer PATCH sem e-mail o apagava
    ...("email" in parsed.data ? { email: parsed.data.email || null } : {}),
  });
  // o site lê as unidades (endereço, lista no contato): não pode esperar o TTL
  await invalidateTenantCache(context.tenant);
  await logAuditFor(context, { action: "store.update", entity: "store", entityId: id }, request);
  return jsonOk({ id });
});

export const DELETE = withApi(async (request: Request, { params }: Params) => {
  const context = await requireApiTenant("stores:write");
  await requireFeature(context.tenant.id, "gestao_multiunidade");
  const { id } = await params;

  await deleteStore(context.tenant.id, id);
  // o site lê as unidades (endereço, lista no contato): não pode esperar o TTL
  await invalidateTenantCache(context.tenant);
  await logAuditFor(context, { action: "store.delete", entity: "store", entityId: id }, request);
  return jsonOk({ deleted: true });
});
