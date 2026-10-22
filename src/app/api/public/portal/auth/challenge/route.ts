import { clientIp, jsonOk, withApi } from "@/lib/http";
import { assertSitesKey } from "@/lib/services/public-api";
import { startChallenge } from "@/lib/services/buyers";
import { buyerChallengeSchema } from "@/lib/validation/buyers";

export const dynamic = "force-dynamic";

/** Portal Carbud: manda o código de acesso por e-mail. */
export const POST = withApi(async (request: Request) => {
  assertSitesKey(request);
  const { email } = buyerChallengeSchema.parse(await request.json().catch(() => null));
  return jsonOk(await startChallenge(email, clientIp(request)));
});
