import { requireApiTenant } from "@/lib/auth/guards";
import { jsonOk, withApi } from "@/lib/http";
import { removeSiteAsset, saveSiteAsset } from "@/lib/services/site-assets";

export const dynamic = "force-dynamic";

export const POST = withApi(async (request: Request) => {
  const context = await requireApiTenant("site:write");
  const key = await saveSiteAsset(context, request, "faviconDark");
  return jsonOk({ key });
});

export const DELETE = withApi(async (request: Request) => {
  const context = await requireApiTenant("site:write");
  await removeSiteAsset(context, request, "faviconDark");
  return jsonOk({ ok: true });
});
