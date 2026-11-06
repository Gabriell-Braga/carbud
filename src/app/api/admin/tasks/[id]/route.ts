import { logAuditFor } from "@/lib/audit";
import { requireApiTenant } from "@/lib/auth/guards";
import { jsonOk, withApi } from "@/lib/http";
import { listLeadTasks, updateLeadTask } from "@/lib/services/lead-tasks";
import { leadTaskUpdateSchema } from "@/lib/validation/leads";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const PATCH = withApi(async (request: Request, { params }: Params) => {
  const context = await requireApiTenant("leads:write");
  const { id } = await params;
  const input = leadTaskUpdateSchema.parse(await request.json().catch(() => null));

  const leadId = await updateLeadTask(context.tenant.id, id, input, {
    userId: context.user.id,
    userName: context.user.name,
  });

  await logAuditFor(
    context,
    { action: "lead.task.update", entity: "lead", entityId: leadId, metadata: { taskId: id, status: input.status } },
    request,
  );

  return jsonOk({ tasks: await listLeadTasks(context.tenant.id, leadId) });
});
