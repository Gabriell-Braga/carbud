import { requireApiTenant } from "@/lib/auth/guards";
import { requireFeature } from "@/lib/api/feature-guard";
import { logAuditFor } from "@/lib/audit";
import { jsonOk, withApi } from "@/lib/http";
import { createCampaign, listCampaigns } from "@/lib/services/campaigns";
import { campaignSchema } from "@/lib/validation/crm";

export const dynamic = "force-dynamic";

export const GET = withApi(async () => {
  const context = await requireApiTenant("campaigns:write");
  return jsonOk({ campaigns: await listCampaigns(context.tenant.id) });
});

export const POST = withApi(async (request: Request) => {
  const context = await requireApiTenant("campaigns:write");
  await requireFeature(context.tenant.id, "whatsapp_integrado");
  const input = campaignSchema.parse(await request.json().catch(() => null));

  const id = await createCampaign(context.tenant.id, input, {
    userId: context.user.id,
    userName: context.user.name,
  });

  // a finalidade vai para a auditoria também: é o registro que a LGPD pede
  await logAuditFor(
    context,
    {
      action: "campaign.create",
      entity: "campaign",
      entityId: id,
      metadata: { name: input.name, purpose: input.purpose, template: input.templateName },
    },
    request,
  );
  return jsonOk({ id });
});
