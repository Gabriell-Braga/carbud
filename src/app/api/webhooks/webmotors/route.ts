import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { portalConnections, webhookEvents } from "@/db/schema";
import { clientIp } from "@/lib/http";
import { parseLeadNotice } from "@/lib/integrations/webmotors";
import { processWebmotorsEvent } from "@/lib/services/portal-leads";

export const dynamic = "force-dynamic";

/**
 * Avisos de lead do Webmotors.
 *
 * É esta URL que vai no campo CALLBACK URL LEADS do app no portal de
 * desenvolvedores do Webmotors, uma vez só, para todas as revendas:
 * https://<host>/app/api/webhooks/webmotors
 *
 * O aviso traz só ids. A revenda é achada pelo CNPJ que ela informou ao
 * conectar, e o lead é buscado na API com o usuário dela — ver
 * `integrations/webmotors`.
 *
 * O Webmotors reenvia o que não recebe 200, a cada 30 minutos, até 3 vezes.
 * Por isso falha nossa na busca responde 500: o reenvio é uma segunda chance
 * de graça. Aviso de loja que não está conectada responde 200, porque
 * reenviar não muda nada.
 */
export async function POST(request: Request) {
  const notice = parseLeadNotice(await request.json().catch(() => null));
  if (!notice) {
    return Response.json({ received: true, ignored: "payload não reconhecido" });
  }

  const db = await getDb();
  const connections = await db
    .select({ tenantId: portalConnections.tenantId, settings: portalConnections.settings })
    .from(portalConnections)
    .where(
      and(eq(portalConnections.portal, "webmotors"), eq(portalConnections.status, "conectado")),
    );
  const owner = connections.find((connection) => {
    const settings = connection.settings ?? {};
    if (notice.cnpj && settings.cnpj === notice.cnpj) return true;
    return Boolean(notice.clientCode && settings.clientCode === notice.clientCode);
  });

  if (!owner) {
    console.warn("[webmotors] aviso de loja sem revenda conectada", notice.cnpj, clientIp(request));
  }

  const id = `webmotors:${notice.leadId}:${notice.leadType}`;
  await db
    .insert(webhookEvents)
    .values({
      id,
      provider: "webmotors",
      eventType: "lead",
      tenantId: owner?.tenantId ?? null,
      payload: {
        IdLead: notice.leadId,
        IdTipoLead: notice.leadType,
        Cnpj: notice.cnpj,
        CodigoCliente: notice.clientCode,
      },
      ...(owner ? {} : { processedAt: new Date(), error: "loja sem revenda conectada" }),
    })
    .onConflictDoNothing();

  if (!owner) return Response.json({ received: true, tenant: false });

  const rows = await db.select().from(webhookEvents).where(eq(webhookEvents.id, id)).limit(1);
  const event = rows[0];
  // reenvio de um aviso que já virou lead
  if (!event || event.processedAt) return Response.json({ received: true, duplicate: true });

  try {
    const outcome = await processWebmotorsEvent(event);
    return Response.json({ received: true, outcome });
  } catch (error) {
    console.error("[webmotors] lead não processado", notice.leadId, error);
    return Response.json({ received: false }, { status: 500 });
  }
}
