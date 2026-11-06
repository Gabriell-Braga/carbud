import { requireApiTenant } from "@/lib/auth/guards";
import { requireFeature } from "@/lib/api/feature-guard";
import { logAuditFor } from "@/lib/audit";
import { jsonOk, withApi } from "@/lib/http";
import { sendNextBatch } from "@/lib/services/campaigns";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Um lote por chamada; a tela repete enquanto `pending` for maior que zero. */
export const POST = withApi(async (request: Request, { params }: Params) => {
  const context = await requireApiTenant("campaigns:write");
  await requireFeature(context.tenant.id, "whatsapp_integrado");
  const { id } = await params;
  const progress = await sendNextBatch(context.tenant.id, id);
  if (progress.status === "done") {
    await logAuditFor(
      context,
      { action: "campaign.done", entity: "campaign", entityId: id, metadata: progress },
      request,
    );
  }
  return jsonOk(progress);
});
