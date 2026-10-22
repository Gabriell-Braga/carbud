import { badRequest, jsonOk, withApi } from "@/lib/http";
import { assertSitesKey } from "@/lib/services/public-api";
import { listFavorites, removeFavorite, requireBuyer, saveFavorite } from "@/lib/services/buyers";
import { favoriteSnapshotSchema } from "@/lib/validation/buyers";

export const dynamic = "force-dynamic";

export const GET = withApi(async (request: Request) => {
  assertSitesKey(request);
  const buyer = await requireBuyer(request);
  return jsonOk(await listFavorites(buyer.id));
});

/** Aceita um favorito ou vários: no login o portal manda de uma vez o que estava só no aparelho. */
export const PUT = withApi(async (request: Request) => {
  assertSitesKey(request);
  const buyer = await requireBuyer(request);
  const body = await request.json().catch(() => null);
  const items = favoriteSnapshotSchema.array().max(200).parse(Array.isArray(body) ? body : [body]);
  for (const item of items) await saveFavorite(buyer.id, item);
  return jsonOk(await listFavorites(buyer.id));
});

export const DELETE = withApi(async (request: Request) => {
  assertSitesKey(request);
  const buyer = await requireBuyer(request);
  const id = new URL(request.url).searchParams.get("id");
  if (!id) throw badRequest("Informe o veículo.");
  await removeFavorite(buyer.id, id);
  return jsonOk({ removed: true });
});
