import { logAuditFor } from "@/lib/audit";
import { parsePatch } from "@/lib/validation/patch";
import { requireApiTenant } from "@/lib/auth/guards";
import { requireFeature } from "@/lib/api/feature-guard";
import { badRequest, jsonOk, notFound, withApi } from "@/lib/http";
import { deleteFinancing, updateFinancing } from "@/lib/services/financings";
import { financingSchema } from "@/lib/validation/crm";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const PATCH = withApi(async (request: Request, { params }: Params) => {
  const context = await requireApiTenant("financings:write");
  await requireFeature(context.tenant.id, "gestao_financiamentos");
  const { id } = await params;

  const parsed = parsePatch(financingSchema, await request.json().catch(() => null));
  if (!parsed.success) throw badRequest("Dados inválidos", parsed.error.issues);

  const ok = await updateFinancing(context.tenant.id, id, parsed.data);
  if (!ok) throw notFound("Proposta não encontrada");

  await logAuditFor(
    context,
    { action: "financing.update", entity: "financing", entityId: id, metadata: parsed.data },
    request,
  );
  return jsonOk({ id });
});

export const DELETE = withApi(async (request: Request, { params }: Params) => {
  const context = await requireApiTenant("financings:write");
  await requireFeature(context.tenant.id, "gestao_financiamentos");
  const { id } = await params;

  const ok = await deleteFinancing(context.tenant.id, id);
  if (!ok) throw notFound("Proposta não encontrada");

  await logAuditFor(context, { action: "financing.delete", entity: "financing", entityId: id }, request);
  return jsonOk({ deleted: true });
});
