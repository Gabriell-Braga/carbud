import { jsonOk, withApi } from "@/lib/http";
import { assertOpsSecret } from "@/lib/ops";
import { relinkPortalLeads } from "@/lib/services/portal-leads";

export const dynamic = "force-dynamic";

/**
 * Liga ao carro os leads de portal que chegaram sem ele (ex.: OLX antes de
 * casar pelo `list_id`). Sem `?tenantId=`, todas as revendas.
 */
export const POST = withApi(async (request: Request) => {
  assertOpsSecret(request);
  const tenantId = new URL(request.url).searchParams.get("tenantId") ?? undefined;
  return jsonOk(await relinkPortalLeads(tenantId));
});
