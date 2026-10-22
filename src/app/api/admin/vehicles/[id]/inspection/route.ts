import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { vehicles } from "@/db/schema";
import { logAuditFor } from "@/lib/audit";
import { requireApiTenant } from "@/lib/auth/guards";
import { badRequest, jsonOk, notFound, withApi } from "@/lib/http";
import { getVehicle } from "@/lib/services/vehicles";
import { deleteObjects, putObject, tenantAssetKey } from "@/lib/storage/r2";
import { inspectionSchema } from "@/lib/validation/vehicles";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const MAX_REPORT_BYTES = 10 * 1024 * 1024;

/**
 * Laudo de vistoria: o PDF e os dados dele sobem juntos.
 *
 * Sem o arquivo não existe vistoria — é o que impede o selo de virar caixinha
 * marcada sem prova. Trocar empresa, data ou resultado é reenviar o laudo.
 */
export const POST = withApi(async (request: Request, { params }: Params) => {
  const context = await requireApiTenant("vehicles:write");
  const { id } = await params;

  const found = await getVehicle(context.tenant.id, id);
  if (!found) throw notFound("Veículo não encontrado");

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) throw badRequest("Anexe o laudo em PDF");
  if (file.type !== "application/pdf") throw badRequest("O laudo precisa ser um PDF");
  if (file.size > MAX_REPORT_BYTES) throw badRequest("Laudo maior que 10 MB");

  const data = inspectionSchema.parse({
    provider: formData?.get("provider"),
    date: formData?.get("date"),
    result: formData?.get("result"),
  });

  const key = tenantAssetKey(context.tenant.id, "inspections", crypto.randomUUID(), "pdf");
  await putObject(key, await file.arrayBuffer(), file.type);

  const db = await getDb();
  await db
    .update(vehicles)
    .set({
      inspectionProvider: data.provider,
      inspectionDate: data.date,
      inspectionResult: data.result,
      inspectionReportKey: key,
    })
    .where(and(eq(vehicles.tenantId, context.tenant.id), eq(vehicles.id, id)));

  if (found.vehicle.inspectionReportKey) await deleteObjects([found.vehicle.inspectionReportKey]);
  await logAuditFor(
    context,
    { action: "vehicle.inspection.update", entity: "vehicle", entityId: id, metadata: { result: data.result } },
    request,
  );

  return jsonOk({ key });
});

export const DELETE = withApi(async (request: Request, { params }: Params) => {
  const context = await requireApiTenant("vehicles:write");
  const { id } = await params;

  const found = await getVehicle(context.tenant.id, id);
  if (!found) throw notFound("Veículo não encontrado");

  const db = await getDb();
  await db
    .update(vehicles)
    .set({ inspectionProvider: null, inspectionDate: null, inspectionResult: null, inspectionReportKey: null })
    .where(and(eq(vehicles.tenantId, context.tenant.id), eq(vehicles.id, id)));

  if (found.vehicle.inspectionReportKey) await deleteObjects([found.vehicle.inspectionReportKey]);
  await logAuditFor(context, { action: "vehicle.inspection.delete", entity: "vehicle", entityId: id }, request);

  return jsonOk({ ok: true });
});
