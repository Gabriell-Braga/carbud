import { requireApiTenant } from "@/lib/auth/guards";
import { logAuditFor } from "@/lib/audit";
import { jsonOk, withApi } from "@/lib/http";
import { cancelCampaign } from "@/lib/services/campaigns";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const POST = withApi(async (request: Request, { params }: Params) => {
  const context = await requireApiTenant("campaigns:write");
  const { id } = await params;
  await cancelCampaign(context.tenant.id, id);
  await logAuditFor(context, { action: "campaign.cancel", entity: "campaign", entityId: id }, request);
  return jsonOk({ id });
});
