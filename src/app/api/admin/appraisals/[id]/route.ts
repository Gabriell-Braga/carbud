import { logAuditFor } from "@/lib/audit";
import { parsePatch } from "@/lib/validation/patch";
import { requireApiTenant } from "@/lib/auth/guards";
import { requireFeature } from "@/lib/api/feature-guard";
import { badRequest, jsonOk, notFound, withApi } from "@/lib/http";
import { deleteAppraisal, updateAppraisal } from "@/lib/services/appraisals";
import { appraisalSchema } from "@/lib/validation/appraisals";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const PATCH = withApi(async (request: Request, { params }: Params) => {
  const context = await requireApiTenant("appraisals:write");
  await requireFeature(context.tenant.id, "avaliacao_veiculos");
  const { id } = await params;

  const parsed = parsePatch(appraisalSchema, await request.json().catch(() => null));
  if (!parsed.success) throw badRequest("Dados inválidos", parsed.error.issues);

  const ok = await updateAppraisal(context.tenant.id, id, parsed.data);
  if (!ok) throw notFound("Avaliação não encontrada");

  await logAuditFor(
    context,
    { action: "appraisal.update", entity: "appraisal", entityId: id, metadata: parsed.data },
    request,
  );
  return jsonOk({ id });
});

export const DELETE = withApi(async (request: Request, { params }: Params) => {
  const context = await requireApiTenant("appraisals:write");
  await requireFeature(context.tenant.id, "avaliacao_veiculos");
  const { id } = await params;

  const ok = await deleteAppraisal(context.tenant.id, id);
  if (!ok) throw notFound("Avaliação não encontrada");

  await logAuditFor(
    context,
    { action: "appraisal.delete", entity: "appraisal", entityId: id },
    request,
  );
  return jsonOk({ deleted: true });
});
