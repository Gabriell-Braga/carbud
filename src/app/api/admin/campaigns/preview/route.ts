import { requireApiTenant } from "@/lib/auth/guards";
import { jsonOk, withApi } from "@/lib/http";
import { previewAudience } from "@/lib/services/campaigns";
import { campaignAudienceSchema } from "@/lib/validation/crm";

export const dynamic = "force-dynamic";

export const POST = withApi(async (request: Request) => {
  const context = await requireApiTenant("campaigns:write");
  const audience = campaignAudienceSchema.parse(await request.json().catch(() => null));
  return jsonOk(await previewAudience(context.tenant.id, audience));
});
