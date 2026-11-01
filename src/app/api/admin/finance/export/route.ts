import { logAuditFor } from "@/lib/audit";
import { requireApiTenant } from "@/lib/auth/guards";
import { withApi } from "@/lib/http";
import { financeCsv } from "@/lib/services/finance-csv";
import { listFinanceRows } from "@/lib/services/vehicle-finance";
import { financeFiltersSchema } from "@/lib/validation/finance";

export const dynamic = "force-dynamic";

/** Mesmos filtros da tela Financeiro, em planilha. */
export const GET = withApi(async (request: Request) => {
  const context = await requireApiTenant("finance:read");
  const filters = financeFiltersSchema.parse(Object.fromEntries(new URL(request.url).searchParams));
  const rows = await listFinanceRows(context.tenant.id, filters, 10_000);

  // sai CPF de comprador: fica registrado quem baixou
  await logAuditFor(
    context,
    { action: "finance.export", entity: "tenant", entityId: context.tenant.id, metadata: { rows: rows.length, ...filters } },
    request,
  );

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(financeCsv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="financeiro-${stamp}.csv"`,
      "cache-control": "no-store",
    },
  });
});
