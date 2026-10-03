import { z } from "zod";
import { logAuditFor } from "@/lib/audit";
import { requireApiTenant } from "@/lib/auth/guards";
import { requireFeature } from "@/lib/api/feature-guard";
import { badRequest, jsonOk, withApi } from "@/lib/http";
import { getPortal } from "@/lib/integrations/portals";
import { syncInBackground } from "@/lib/services/portal-sync";
import { setPublicationListingType } from "@/lib/services/portals";
import { getOrigin } from "@/lib/seo/urls";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ portal: string; id: string }> };

const schema = z.object({
  /** Código do tipo no portal; null volta ao padrão da loja. */
  listingType: z.string().min(1).max(40).nullable(),
});

/** Tipo de anúncio de um carro só (ex.: este vai em Super Destaque). */
export const PATCH = withApi(async (request: Request, { params }: Params) => {
  const context = await requireApiTenant("tenant:settings");
  await requireFeature(context.tenant.id, "integracao_classificados");
  const { portal, id } = await params;
  if (getPortal(portal)?.adTypes !== "plan")
    throw badRequest("Este portal não tem tipo de anúncio por carro.");

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw badRequest("Dados inválidos", parsed.error.issues);

  await setPublicationListingType(context.tenant.id, id, parsed.data.listingType);
  // a troca vai para o portal já, sem esperar o agendador
  await syncInBackground(context.tenant.id, await getOrigin());

  await logAuditFor(
    context,
    {
      action: "portal.listing_type",
      entity: "vehicle_publication",
      entityId: id,
      metadata: { portal, listingType: parsed.data.listingType },
    },
    request,
  );
  return jsonOk({ id, listingType: parsed.data.listingType });
});
