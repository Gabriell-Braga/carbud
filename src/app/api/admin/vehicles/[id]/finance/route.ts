import { logAuditFor } from "@/lib/audit";
import { requireApiTenant } from "@/lib/auth/guards";
import { jsonOk, notFound, withApi } from "@/lib/http";
import { addVehicleExpense, saveVehicleFinance } from "@/lib/services/vehicle-finance";
import { getVehicle } from "@/lib/services/vehicles";
import { vehicleExpenseSchema, vehicleFinanceSchema } from "@/lib/validation/finance";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Compra e venda do carro (valores, datas, origem, comprador). */
export const PUT = withApi(async (request: Request, { params }: Params) => {
  const context = await requireApiTenant("finance:write");
  const { id } = await params;
  const input = vehicleFinanceSchema.parse(await request.json().catch(() => null));

  if (!(await getVehicle(context.tenant.id, id))) throw notFound("Veículo não encontrado");
  await saveVehicleFinance(context.tenant.id, id, input);

  await logAuditFor(
    context,
    { action: "vehicle.finance.update", entity: "vehicle", entityId: id, metadata: { changes: Object.keys(input) } },
    request,
  );
  return jsonOk({ id });
});

/** Lança um custo no carro. */
export const POST = withApi(async (request: Request, { params }: Params) => {
  const context = await requireApiTenant("finance:write");
  const { id } = await params;
  const input = vehicleExpenseSchema.parse(await request.json().catch(() => null));

  if (!(await getVehicle(context.tenant.id, id))) throw notFound("Veículo não encontrado");
  const expense = await addVehicleExpense(context.tenant.id, id, input);

  await logAuditFor(
    context,
    {
      action: "vehicle.expense.create",
      entity: "vehicle",
      entityId: id,
      metadata: { category: input.category, amountCents: input.amountCents },
    },
    request,
  );
  return jsonOk(expense);
});
