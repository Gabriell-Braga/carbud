import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { portalConnections, vehiclePublications, webhookEvents } from "@/db/schema";
import { jsonOk, withApi } from "@/lib/http";
import { assertOpsSecret } from "@/lib/ops";
import { getOrigin } from "@/lib/seo/urls";
import { syncTenantPortals } from "@/lib/services/portal-sync";

export const dynamic = "force-dynamic";

/**
 * Passada geral dos portais, para o agendador — nos dois sentidos.
 *
 * Ida: o caminho normal é a sincronização logo depois de salvar o veículo;
 * este endpoint recolhe o que ficou para trás (portal fora do ar na hora,
 * erro corrigido depois) e renova tokens de quem não mexe no estoque há horas.
 *
 * Volta: as perguntas que o portal avisou e que ainda não viraram lead. Por
 * isso a lista de revendas não é só a de quem tem fila de publicação — uma
 * revenda com o estoque todo publicado e uma pergunta nova não entraria nela,
 * e o lead ficaria parado no banco esperando alguém clicar em "sincronizar".
 *
 * Mesmo header `x-ops-secret` dos outros /api/ops.
 */
export const POST = withApi(async (request: Request) => {
  assertOpsSecret(request);

  const db = await getDb();

  const [pendingQueue, pendingNotifications] = await Promise.all([
    db
      .selectDistinct({ tenantId: vehiclePublications.tenantId })
      .from(vehiclePublications)
      .where(inArray(vehiclePublications.status, ["pendente", "removendo", "erro"])),
    /*
     * Aviso sem revenda dona já nasce processado (o webhook marca), então o
     * que sobra aqui é de conta conectada. O join com a conexão evita
     * acordar revenda que desconectou o portal e deixou avisos para trás.
     */
    db
      .selectDistinct({ tenantId: webhookEvents.tenantId })
      .from(webhookEvents)
      .innerJoin(
        portalConnections,
        and(
          eq(portalConnections.tenantId, webhookEvents.tenantId),
          // o aviso é do mesmo portal da conexão (Mercado Livre, Webmotors)
          eq(portalConnections.portal, webhookEvents.provider),
          eq(portalConnections.status, "conectado"),
        ),
      )
      .where(
        and(
          inArray(webhookEvents.provider, ["mercadolivre", "webmotors"]),
          isNull(webhookEvents.processedAt),
        ),
      ),
  ]);

  const tenantIds = [
    ...new Set(
      [...pendingQueue, ...pendingNotifications]
        .map((row) => row.tenantId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const origin = await getOrigin();
  const results = [];
  for (const tenantId of tenantIds) {
    results.push({ tenantId, reports: await syncTenantPortals(tenantId, origin) });
  }
  return jsonOk({ tenants: results.length, results });
});
