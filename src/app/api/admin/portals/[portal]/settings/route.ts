import { z } from "zod";
import { logAuditFor } from "@/lib/audit";
import { requireApiTenant } from "@/lib/auth/guards";
import { requireFeature } from "@/lib/api/feature-guard";
import { badRequest, jsonOk, withApi } from "@/lib/http";
import { updateConnectionSettings } from "@/lib/services/portals";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ portal: string }> };

const schema = z.object({
  /** Tipo de anúncio padrão da loja no portal; null = escolher sozinho. */
  listingTypeId: z.string().min(1).max(40).nullable(),
});

/** Ajustes que a revenda controla no portal. Hoje: o tipo de anúncio padrão. */
export const PATCH = withApi(async (request: Request, { params }: Params) => {
  const context = await requireApiTenant("tenant:settings");
  await requireFeature(context.tenant.id, "integracao_classificados");
  const { portal } = await params;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw badRequest("Dados inválidos", parsed.error.issues);

  await updateConnectionSettings(context.tenant.id, portal, parsed.data);
  await logAuditFor(
    context,
    {
      action: "portal.settings",
      entity: "portal_connection",
      entityId: portal,
      metadata: parsed.data,
    },
    request,
  );
  return jsonOk({ portal, ...parsed.data });
});
