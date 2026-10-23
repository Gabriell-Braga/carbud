import { requireApiSuperAdmin } from "@/lib/auth/guards";
import { badRequest, jsonOk, withApi } from "@/lib/http";
import { affiliateTotals, brazilMonthPeriod, getAffiliate } from "@/lib/services/affiliates";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Totais acumulados e, com ?mes=AAAA-MM, os do mês no fuso de Brasília. */
export const GET = withApi(async (request: Request, { params }: Params) => {
  await requireApiSuperAdmin("platform:affiliates:read");
  const { id } = await params;
  await getAffiliate(id);

  const month = new URL(request.url).searchParams.get("mes");
  const period = month ? brazilMonthPeriod(month) : null;
  if (month && !period) throw badRequest("Mês inválido: use AAAA-MM");

  const totals = await affiliateTotals([id], period);
  return jsonOk({ month, ...totals.get(id) });
});
