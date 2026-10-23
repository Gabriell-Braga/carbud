import { getDb } from "@/db";
import { vehicles } from "@/db/schema";
import { logAuditFor } from "@/lib/audit";
import { requireApiTenant } from "@/lib/auth/guards";
import { badRequest, forbidden, jsonOk, withApi } from "@/lib/http";
import { buildVehicleSlug } from "@/lib/services/vehicles";
import { queueVehicleSync } from "@/lib/services/portals";
import { syncInBackground } from "@/lib/services/portal-sync";
import { getOrigin } from "@/lib/seo/urls";
import { dispatchTenantEvent } from "@/lib/services/api-access";
import { checkTenantLimit } from "@/lib/plans/service";
import { assertStoreOfTenant } from "@/lib/services/stores";
import { vehicleSchema } from "@/lib/validation/vehicles";

export const dynamic = "force-dynamic";

export const POST = withApi(async (request: Request) => {
  const context = await requireApiTenant("vehicles:write");

  const parsed = vehicleSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw badRequest("Dados inválidos", parsed.error.issues);
  const input = parsed.data;
  await assertStoreOfTenant(context.tenant.id, input.storeId);

  // rascunho não ocupa vaga; só publicar consome o limite do plano
  if (input.status === "available" || input.status === "reserved") {
    const limit = await checkTenantLimit(context.tenant.id, "maxVehicles");
    if (!limit.allowed) throw forbidden(limit.message!);
  }

  const slug = await buildVehicleSlug(context.tenant.id, input);
  const db = await getDb();

  const created = await db
    .insert(vehicles)
    .values({
      tenantId: context.tenant.id,
      slug,
      brand: input.brand,
      model: input.model,
      version: input.version,
      yearManufacture: input.yearManufacture,
      yearModel: input.yearModel,
      mileageKm: input.mileageKm,
      priceCents: input.priceCents,
      priceOnRequest: input.priceOnRequest,
      transmission: input.transmission,
      fuel: input.fuel,
      bodyType: input.bodyType,
      color: input.color,
      doors: input.doors,
      licensePlate: input.licensePlate,
      options: input.options,
      description: input.description,
      status: input.status,
      featured: input.featured,
      storeId: input.storeId,
    })
    .returning({ id: vehicles.id, slug: vehicles.slug });
  await queueVehicleSync(context.tenant.id, created[0].id);
  await syncInBackground(context.tenant.id, await getOrigin());
  await dispatchTenantEvent(context.tenant.id, "vehicle.created", { id: created[0].id });


  await logAuditFor(
    context,
    {
      action: "vehicle.create",
      entity: "vehicle",
      entityId: created[0].id,
      metadata: { brand: input.brand, model: input.model, status: input.status },
    },
    request,
  );

  return jsonOk({ id: created[0].id, slug: created[0].slug });
});
