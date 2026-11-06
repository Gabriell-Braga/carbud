import { logAuditFor } from "@/lib/audit";
import { requireApiTenant } from "@/lib/auth/guards";
import { jsonOk, notFound, withApi } from "@/lib/http";
import { getLead } from "@/lib/services/leads";
import { createLeadTask, listLeadTasks } from "@/lib/services/lead-tasks";
import { leadTaskSchema } from "@/lib/validation/leads";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const GET = withApi(async (_request: Request, { params }: Params) => {
  const context = await requireApiTenant("leads:read");
  const { id } = await params;
  if (!(await getLead(context.tenant.id, id))) throw notFound("Lead não encontrado");
  return jsonOk({ tasks: await listLeadTasks(context.tenant.id, id) });
});

export const POST = withApi(async (request: Request, { params }: Params) => {
  const context = await requireApiTenant("leads:write");
  const { id } = await params;
  const input = leadTaskSchema.parse(await request.json().catch(() => null));

  const taskId = await createLeadTask(context.tenant.id, id, input, {
    userId: context.user.id,
    userName: context.user.name,
  });

  await logAuditFor(
    context,
    { action: "lead.task.create", entity: "lead", entityId: id, metadata: { taskId, kind: input.kind } },
    request,
  );

  return jsonOk({ id: taskId, tasks: await listLeadTasks(context.tenant.id, id) });
});
