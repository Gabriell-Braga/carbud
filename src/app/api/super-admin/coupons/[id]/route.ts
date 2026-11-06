import { and, eq, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { affiliates, coupons } from "@/db/schema";
import { logAuditFor } from "@/lib/audit";
import { requireApiSuperAdmin } from "@/lib/auth/guards";
import { badRequest, conflict, jsonOk, notFound, withApi } from "@/lib/http";
import { couponUpdateSchema } from "@/lib/validation/plans";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const PATCH = withApi(async (request: Request, { params }: Params) => {
  const context = await requireApiSuperAdmin("platform:billing:write");
  const { id } = await params;

  const parsed = couponUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw badRequest("Dados inválidos", parsed.error.issues);
  const input = parsed.data;

  const db = await getDb();
  const current = await db.select().from(coupons).where(eq(coupons.id, id)).limit(1);
  if (!current[0]) throw notFound("Cupom não encontrado");

  if (input.code !== current[0].code) {
    const clash = await db
      .select({ id: coupons.id })
      .from(coupons)
      .where(and(eq(coupons.code, input.code), ne(coupons.id, id)))
      .limit(1);
    if (clash[0]) throw conflict("Já existe um cupom com este código");
  }

  await db
    .update(coupons)
    .set({
      ...input,
      planIds: input.planIds ?? [],
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    })
    .where(eq(coupons.id, id));

  await logAuditFor(
    context,
    { action: "coupon.update", entity: "coupon", entityId: id, metadata: { code: input.code } },
    request,
  );

  return jsonOk({ id });
});

export const DELETE = withApi(async (request: Request, { params }: Params) => {
  const context = await requireApiSuperAdmin("platform:billing:write");
  const { id } = await params;

  const db = await getDb();
  const current = await db
    .select({ code: coupons.code, redemptions: coupons.redemptions })
    .from(coupons)
    .where(eq(coupons.id, id))
    .limit(1);
  if (!current[0]) throw notFound("Cupom não encontrado");

  // cupom já usado vira histórico de desconto: desativar preserva o rastro
  if (current[0].redemptions > 0) {
    await db.update(coupons).set({ active: false }).where(eq(coupons.id, id));
    await logAuditFor(
      context,
      { action: "coupon.deactivate", entity: "coupon", entityId: id, metadata: { code: current[0].code } },
      request,
    );
    return jsonOk({ deactivated: true });
  }

  // afiliado que usava o cupom volta a indicar sem cupom (a FK barraria a exclusão)
  await db.batch([
    db.update(affiliates).set({ couponId: null }).where(eq(affiliates.couponId, id)),
    db.delete(coupons).where(eq(coupons.id, id)),
  ]);
  await logAuditFor(
    context,
    { action: "coupon.delete", entity: "coupon", entityId: id, metadata: { code: current[0].code } },
    request,
  );

  return jsonOk({ deleted: true });
});
