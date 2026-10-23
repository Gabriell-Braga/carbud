import { requireApiSuperAdmin } from "@/lib/auth/guards";
import { jsonOk, withApi } from "@/lib/http";
import { affiliateStatement, getAffiliate } from "@/lib/services/affiliates";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const GET = withApi(async (request: Request, { params }: Params) => {
  await requireApiSuperAdmin("platform:affiliates:read");
  const { id } = await params;
  await getAffiliate(id);

  const page = Math.max(1, Number(new URL(request.url).searchParams.get("pagina")) || 1);
  return jsonOk({ page, ...(await affiliateStatement(id, page)) });
});
