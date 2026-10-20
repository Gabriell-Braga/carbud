import { and, eq } from "drizzle-orm";
import { parsePatch } from "@/lib/validation/patch";
import { getDb } from "@/db";
import { tenantBanners } from "@/db/schema";
import { logAuditFor } from "@/lib/audit";
import { requireApiTenant } from "@/lib/auth/guards";
import { badRequest, jsonOk, notFound, withApi } from "@/lib/http";
import { deleteObjects } from "@/lib/storage/r2";
import { invalidateTenantCache } from "@/lib/tenant/service";
import { bannerSchema } from "@/lib/validation/site";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const PATCH = withApi(async (request: Request, { params }: Params) => {
  const context = await requireApiTenant("site:write");
  const { id } = await params;

  const parsed = parsePatch(bannerSchema, await request.json().catch(() => null));
  if (!parsed.success) throw badRequest("Dados inválidos", parsed.error.issues);

  const db = await getDb();
  const found = await db
    .select({ id: tenantBanners.id })
    .from(tenantBanners)
    .where(and(eq(tenantBanners.tenantId, context.tenant.id), eq(tenantBanners.id, id)))
    .limit(1);
  if (!found[0]) throw notFound("Banner não encontrado");

  await db
    .update(tenantBanners)
    .set(parsed.data)
    .where(and(eq(tenantBanners.tenantId, context.tenant.id), eq(tenantBanners.id, id)));

  await invalidateTenantCache({ id: context.tenant.id, slug: context.tenant.slug });
  await logAuditFor(
    context,
    { action: "site.banner.update", entity: "tenant_banner", entityId: id },
    request,
  );

  return jsonOk({ id });
});

export const DELETE = withApi(async (request: Request, { params }: Params) => {
  const context = await requireApiTenant("site:write");
  const { id } = await params;

  const db = await getDb();
  const found = await db
    .select()
    .from(tenantBanners)
    .where(and(eq(tenantBanners.tenantId, context.tenant.id), eq(tenantBanners.id, id)))
    .limit(1);
  const banner = found[0];
  if (!banner) throw notFound("Banner não encontrado");

  await db
    .delete(tenantBanners)
    .where(and(eq(tenantBanners.tenantId, context.tenant.id), eq(tenantBanners.id, id)));

  await deleteObjects(
    [banner.imageKey, banner.imageKeyMobile].filter((key): key is string => Boolean(key)),
  );
  await invalidateTenantCache({ id: context.tenant.id, slug: context.tenant.slug });
  await logAuditFor(
    context,
    { action: "site.banner.delete", entity: "tenant_banner", entityId: id },
    request,
  );

  return jsonOk({ id });
});
