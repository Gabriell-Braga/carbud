import { logAuditFor } from "@/lib/audit";
import { requireApiTenant } from "@/lib/auth/guards";
import { jsonOk, notFound, withApi } from "@/lib/http";
import { deleteVehicleExpense } from "@/lib/services/vehicle-finance";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; expenseId: string }> };

export const DELETE = withApi(async (request: Request, { params }: Params) => {
  const context = await requireApiTenant("finance:write");
  const { id, expenseId } = await params;

  const removed = await deleteVehicleExpense(context.tenant.id, id, expenseId);
  if (!removed) throw notFound("Custo não encontrado");

  await logAuditFor(
    context,
    { action: "vehicle.expense.delete", entity: "vehicle", entityId: id, metadata: { expenseId } },
    request,
  );
  return jsonOk({ id: expenseId });
});
