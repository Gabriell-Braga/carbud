import { jsonOk, withApi } from "@/lib/http";
import { assertSitesKey } from "@/lib/services/public-api";
import { verifyChallenge } from "@/lib/services/buyers";
import { buyerVerifySchema } from "@/lib/validation/buyers";

export const dynamic = "force-dynamic";

/** Portal Carbud: troca o código por uma sessão (e cria a conta no primeiro acesso). */
export const POST = withApi(async (request: Request) => {
  assertSitesKey(request);
  const { email, code } = buyerVerifySchema.parse(await request.json().catch(() => null));
  return jsonOk(await verifyChallenge(email, code));
});
