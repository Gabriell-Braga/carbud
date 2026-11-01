import { logAuditFor } from "@/lib/audit";
import { requireApiTenant } from "@/lib/auth/guards";
import { jsonOk, notFound, withApi } from "@/lib/http";
import { deleteStoreExpense } from "@/lib/services/vehicle-finance";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const DELETE = withApi(async (request: Request, { params }: Params) => {
  const context = await requireApiTenant("finance:write");
  const { id } = await params;

  const removed = await deleteStoreExpense(context.tenant.id, id);
  if (!removed) throw notFound("Custo não encontrado");

  await logAuditFor(
    context,
    { action: "finance.store_expense.delete", entity: "tenant", entityId: context.tenant.id, metadata: { id } },
    request,
  );
  return jsonOk({ id });
});
