import { logAuditFor } from "@/lib/audit";
import { requireApiSuperAdmin } from "@/lib/auth/guards";
import { jsonOk, withApi } from "@/lib/http";
import { retryProcessing } from "@/lib/services/affiliates";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Refaz só a apuração de afiliados: consulta o pagamento de novo e acerta a
 * comissão. Não toca em vencimento nem no histórico de cobrança.
 */
export const POST = withApi(async (request: Request, { params }: Params) => {
  const context = await requireApiSuperAdmin("platform:affiliates:write");
  const { id } = await params;

  const result = await retryProcessing(id);

  await logAuditFor(
    context,
    {
      action: "affiliate.processing.retry",
      entity: "affiliate_event_processing",
      entityId: result.id,
      tenantId: null,
      metadata: { state: result.state, error: result.lastError },
    },
    request,
  );

  return jsonOk({ id: result.id, state: result.state, error: result.lastError });
});
