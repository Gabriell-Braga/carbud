import { requireApiTenant } from "@/lib/auth/guards";
import { requireFeature } from "@/lib/api/feature-guard";
import { jsonOk, withApi } from "@/lib/http";
import { approvedTemplates } from "@/lib/services/campaigns";

export const dynamic = "force-dynamic";

export const GET = withApi(async () => {
  const context = await requireApiTenant("campaigns:write");
  await requireFeature(context.tenant.id, "whatsapp_integrado");
  return jsonOk({ templates: await approvedTemplates(context.tenant.id) });
});
