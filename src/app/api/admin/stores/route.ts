import { invalidateTenantCache } from "@/lib/tenant/service";
import { logAuditFor } from "@/lib/audit";
import { requireApiTenant } from "@/lib/auth/guards";
import { requireFeature } from "@/lib/api/feature-guard";
import { badRequest, jsonOk, withApi } from "@/lib/http";
import { createStore, listStores } from "@/lib/services/stores";
import { storeSchema } from "@/lib/validation/crm";

export const dynamic = "force-dynamic";

export const GET = withApi(async () => {
  const context = await requireApiTenant("vehicles:read");
  return jsonOk({ stores: await listStores(context.tenant.id) });
});

export const POST = withApi(async (request: Request) => {
  const context = await requireApiTenant("stores:write");
  await requireFeature(context.tenant.id, "gestao_multiunidade");

  const parsed = storeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw badRequest("Dados inválidos", parsed.error.issues);

  const id = await createStore(context.tenant.id, {
    ...parsed.data,
    email: parsed.data.email || null,
  });

  // o site lê as unidades (endereço, lista no contato): não pode esperar o TTL
  await invalidateTenantCache(context.tenant);
  await logAuditFor(
    context,
    { action: "store.create", entity: "store", entityId: id, metadata: { name: parsed.data.name } },
    request,
  );
  return jsonOk({ id });
});
