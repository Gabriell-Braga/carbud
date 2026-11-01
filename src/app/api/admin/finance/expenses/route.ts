import { logAuditFor } from "@/lib/audit";
import { requireApiTenant } from "@/lib/auth/guards";
import { jsonOk, withApi } from "@/lib/http";
import { addStoreExpense } from "@/lib/services/vehicle-finance";
import { storeExpenseSchema } from "@/lib/validation/finance";

export const dynamic = "force-dynamic";

/** Lança um custo fixo da loja (aluguel, salário...). */
export const POST = withApi(async (request: Request) => {
  const context = await requireApiTenant("finance:write");
  const input = storeExpenseSchema.parse(await request.json().catch(() => null));
  const expense = await addStoreExpense(context.tenant.id, input);

  await logAuditFor(
    context,
    {
      action: "finance.store_expense.create",
      entity: "tenant",
      entityId: context.tenant.id,
      metadata: { category: input.category, amountCents: input.amountCents },
    },
    request,
  );
  return jsonOk(expense);
});
