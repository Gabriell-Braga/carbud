import { jsonOk, withApi } from "@/lib/http";
import { assertSitesKey } from "@/lib/services/public-api";
import { endSession } from "@/lib/services/buyers";

export const dynamic = "force-dynamic";

export const POST = withApi(async (request: Request) => {
  assertSitesKey(request);
  await endSession(request);
  return jsonOk({ ended: true });
});
