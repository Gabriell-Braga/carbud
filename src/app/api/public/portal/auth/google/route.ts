import { jsonOk, withApi } from "@/lib/http";
import { assertSitesKey } from "@/lib/services/public-api";
import { verifyGoogle } from "@/lib/services/buyers";
import { buyerGoogleSchema } from "@/lib/validation/buyers";

export const dynamic = "force-dynamic";

/** Portal Carbud: troca o id_token do Google por uma sessão (e cria a conta no primeiro acesso). */
export const POST = withApi(async (request: Request) => {
  assertSitesKey(request);
  const { idToken } = buyerGoogleSchema.parse(await request.json().catch(() => null));
  return jsonOk(await verifyGoogle(idToken));
});
