import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { vehicleMedia360, type Media360Kind } from "@/db/schema";
import { logAuditFor } from "@/lib/audit";
import { requireApiTenant } from "@/lib/auth/guards";
import { badRequest, jsonOk, notFound, withApi } from "@/lib/http";
import { getVehicle } from "@/lib/services/vehicles";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_UPLOAD_BYTES,
  deleteObjects,
  putObject,
  vehiclePhotoKey,
} from "@/lib/storage/r2";
import { SPIN_MAX_FRAMES, SPIN_MIN_FRAMES } from "@/lib/catalog/media360";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function parseKind(value: unknown): Media360Kind {
  if (value === "spin" || value === "pano") return value;
  throw badRequest("Tipo de 360° inválido");
}

/**
 * Sobe um giro (quadros em ordem, campo `frame` repetido) ou uma panorâmica
 * (campo `file`). Os dois chegam já reduzidos pelo navegador; enviar de novo
 * substitui o anterior do mesmo tipo.
 */
export const POST = withApi(async (request: Request, { params }: Params) => {
  const context = await requireApiTenant("vehicles:write");
  const { id } = await params;

  const found = await getVehicle(context.tenant.id, id);
  if (!found) throw notFound("Veículo não encontrado");

  const formData = await request.formData().catch(() => null);
  if (!formData) throw badRequest("Envio inválido");
  const kind = parseKind(formData.get("kind"));

  const files = (kind === "spin" ? formData.getAll("frame") : [formData.get("file")]).filter(
    (item): item is File => item instanceof File,
  );
  if (kind === "spin" && (files.length < SPIN_MIN_FRAMES || files.length > SPIN_MAX_FRAMES)) {
    throw badRequest(`O giro precisa de ${SPIN_MIN_FRAMES} a ${SPIN_MAX_FRAMES} fotos`);
  }
  if (kind === "pano" && files.length !== 1) throw badRequest("Envie uma panorâmica");
  for (const file of files) {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) throw badRequest("Formato de imagem não suportado");
    if (file.size > MAX_UPLOAD_BYTES) throw badRequest("Imagem muito grande");
  }

  const groupId = crypto.randomUUID();
  const keys = files.map((file, index) =>
    vehiclePhotoKey(context.tenant.id, id, `${kind}-${groupId}-${String(index).padStart(2, "0")}`, "card", file.type === "image/png" ? "png" : file.type === "image/jpeg" ? "jpg" : "webp"),
  );
  // em lotes: 72 PUTs em série deixariam o envio lento à toa
  for (let start = 0; start < files.length; start += 8) {
    await Promise.all(
      files.slice(start, start + 8).map(async (file, offset) =>
        putObject(keys[start + offset], await file.arrayBuffer(), file.type),
      ),
    );
  }

  const db = await getDb();
  const previous = await db
    .select({ id: vehicleMedia360.id, keys: vehicleMedia360.keys })
    .from(vehicleMedia360)
    .where(and(eq(vehicleMedia360.vehicleId, id), eq(vehicleMedia360.kind, kind)))
    .limit(1);

  if (previous[0]) {
    await db.update(vehicleMedia360).set({ keys }).where(eq(vehicleMedia360.id, previous[0].id));
    await deleteObjects(previous[0].keys);
  } else {
    await db.insert(vehicleMedia360).values({ tenantId: context.tenant.id, vehicleId: id, kind, keys });
  }

  await logAuditFor(
    context,
    { action: "vehicle.media360.upload", entity: "vehicle", entityId: id, metadata: { kind, frames: keys.length } },
    request,
  );

  return jsonOk({ kind, frames: keys.length });
});

export const DELETE = withApi(async (request: Request, { params }: Params) => {
  const context = await requireApiTenant("vehicles:write");
  const { id } = await params;
  const kind = parseKind(new URL(request.url).searchParams.get("tipo"));

  const found = await getVehicle(context.tenant.id, id);
  if (!found) throw notFound("Veículo não encontrado");

  const db = await getDb();
  const rows = await db
    .select({ id: vehicleMedia360.id, keys: vehicleMedia360.keys })
    .from(vehicleMedia360)
    .where(and(eq(vehicleMedia360.vehicleId, id), eq(vehicleMedia360.kind, kind)));

  for (const row of rows) {
    await db.delete(vehicleMedia360).where(eq(vehicleMedia360.id, row.id));
    await deleteObjects(row.keys);
  }
  await logAuditFor(context, { action: "vehicle.media360.delete", entity: "vehicle", entityId: id, metadata: { kind } }, request);

  return jsonOk({ ok: true });
});
