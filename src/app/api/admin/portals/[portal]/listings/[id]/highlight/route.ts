import { logAuditFor } from "@/lib/audit";
import { requireApiTenant } from "@/lib/auth/guards";
import { requireFeature } from "@/lib/api/feature-guard";
import { badRequest, jsonOk, withApi } from "@/lib/http";
import { getPortal } from "@/lib/integrations/portals";
import { highlightOlxListing } from "@/lib/services/portal-sync-olx";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ portal: string; id: string }> };

/**
 * Destaca um anúncio agora (OLX: volta ao topo e agenda as próximas voltas).
 * Gasta saldo do plano da loja, por isso é sempre um clique dela.
 */
export const POST = withApi(async (request: Request, { params }: Params) => {
  const context = await requireApiTenant("tenant:settings");
  await requireFeature(context.tenant.id, "integracao_classificados");
  const { portal, id } = await params;
  if (getPortal(portal)?.adTypes !== "bump")
    throw badRequest("Este portal não tem destaque avulso.");

  const result = await highlightOlxListing(context.tenant.id, id);
  await logAuditFor(
    context,
    {
      action: "portal.highlight",
      entity: "vehicle_publication",
      entityId: id,
      metadata: { portal },
    },
    request,
  );
  return jsonOk(result);
});
