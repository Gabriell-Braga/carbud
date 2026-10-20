import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { vehicles } from "@/db/schema";
import { logAuditFor } from "@/lib/audit";
import { requireApiTenant } from "@/lib/auth/guards";
import { badRequest, forbidden, jsonOk, notFound, withApi } from "@/lib/http";
import { buildVehicleSlug, deleteVehicle, getVehicle } from "@/lib/services/vehicles";
import { queueVehicleSync } from "@/lib/services/portals";
import { closePublicationsBeforeDelete, syncInBackground } from "@/lib/services/portal-sync";
import { getOrigin } from "@/lib/seo/urls";
import { dispatchTenantEvent } from "@/lib/services/api-access";
import { trackVehicleSold } from "@/lib/tracking/sale";
import { checkTenantLimit } from "@/lib/plans/service";
import { vehicleUpdateSchema } from "@/lib/validation/vehicles";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const PATCH = withApi(async (request: Request, { params }: Params) => {
  const context = await requireApiTenant("vehicles:write");
  const { id } = await params;

  const parsed = vehicleUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw badRequest("Dados inválidos", parsed.error.issues);
  const input = parsed.data;

  const existing = await getVehicle(context.tenant.id, id);
  if (!existing) throw notFound("Veículo não encontrado");

  // tirar do rascunho ocupa uma vaga: precisa caber no plano
  const willPublish = input.status === "available" || input.status === "reserved";
  const wasPublished =
    existing.vehicle.status === "available" || existing.vehicle.status === "reserved";
  if (willPublish && !wasPublished) {
    const limit = await checkTenantLimit(context.tenant.id, "maxVehicles");
    if (!limit.allowed) throw forbidden(limit.message!);
  }

  const identityChanged =
    (input.brand !== undefined && input.brand !== existing.vehicle.brand) ||
    (input.model !== undefined && input.model !== existing.vehicle.model) ||
    (input.version !== undefined && input.version !== existing.vehicle.version) ||
    (input.yearModel !== undefined && input.yearModel !== existing.vehicle.yearModel);

  const slug = identityChanged
    ? await buildVehicleSlug(
        context.tenant.id,
        {
          brand: input.brand ?? existing.vehicle.brand,
          model: input.model ?? existing.vehicle.model,
          // null é "apagou a versão", e o `??` trazia a antiga de volta para o slug
          version: input.version !== undefined ? input.version : existing.vehicle.version,
          yearModel: input.yearModel ?? existing.vehicle.yearModel,
        },
        id,
      )
    : undefined;

  const db = await getDb();
  await db
    .update(vehicles)
    .set({
      ...input,
      ...(slug ? { slug } : {}),
      // salvar tira o veículo da faxina: a partir daqui ele é da pessoa, não
      // um rascunho provisório que o cron pode varrer
      draftExpiresAt: null,
    })
    .where(and(eq(vehicles.tenantId, context.tenant.id), eq(vehicles.id, id)));

  // portais e integradores são avisados depois de gravar, nunca antes:
  // portal fora do ar não pode impedir a revenda de salvar o próprio carro
  await queueVehicleSync(context.tenant.id, id);
  await syncInBackground(context.tenant.id, await getOrigin());
  await dispatchTenantEvent(
    context.tenant.id,
    input.status === "sold" ? "vehicle.sold" : "vehicle.updated",
    { id, status: input.status ?? existing.vehicle.status },
  );

  // venda de balcão, sem lead: o sinal sai daqui (ver tracking/sale.ts)
  if (input.status === "sold" && existing.vehicle.status !== "sold") {
    await trackVehicleSold(context.tenant.id, id);
  }

  await logAuditFor(
    context,
    {
      action: "vehicle.update",
      entity: "vehicle",
      entityId: id,
      metadata: { changes: Object.keys(input) },
    },
    request,
  );

  return jsonOk({ id, slug: slug ?? existing.vehicle.slug });
});

export const DELETE = withApi(async (request: Request, { params }: Params) => {
  const context = await requireApiTenant("vehicles:write");
  const { id } = await params;

  // o anúncio no portal fecha antes: apagar leva junto o id que permitiria fechá-lo depois
  await closePublicationsBeforeDelete(context.tenant.id, id);
  const removed = await deleteVehicle(context.tenant.id, id);
  if (!removed) throw notFound("Veículo não encontrado");

  await logAuditFor(
    context,
    {
      action: "vehicle.delete",
      entity: "vehicle",
      entityId: id,
      metadata: { brand: removed.brand, model: removed.model },
    },
    request,
  );

  return jsonOk({ id });
});
