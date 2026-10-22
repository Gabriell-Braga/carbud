import { jsonOk, withApi } from "@/lib/http";
import { assertSitesKey } from "@/lib/services/public-api";
import { buyerView, requireBuyer, updateBuyer } from "@/lib/services/buyers";
import { buyerProfileSchema } from "@/lib/validation/buyers";

export const dynamic = "force-dynamic";

/** Comprador da sessão (`Authorization: Bearer <token>` repassado pelo portal). */
export const GET = withApi(async (request: Request) => {
  assertSitesKey(request);
  return jsonOk(buyerView(await requireBuyer(request)));
});

export const PATCH = withApi(async (request: Request) => {
  assertSitesKey(request);
  const buyer = await requireBuyer(request);
  const input = buyerProfileSchema.parse(await request.json().catch(() => null));
  return jsonOk(await updateBuyer(buyer, input));
});
