import { verifySignature } from "@/lib/integrations/whatsapp-client";
import { parseLeadgenNotices } from "@/lib/integrations/meta-leads";
import {
  connectionByPageId,
  listMetaLeadConnections,
  readMetaLeadCredentials,
  receiveLeadgen,
  recordMetaLeadFailure,
} from "@/lib/services/meta-leads";

export const dynamic = "force-dynamic";

/**
 * Verificação do webhook da página. Mesmo contrato do WhatsApp: a Meta manda
 * um desafio e o token que a revenda escolheu ao conectar.
 */
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const token = query.get("hub.verify_token");
  const challenge = query.get("hub.challenge");
  if (query.get("hub.mode") !== "subscribe" || !token || !challenge) {
    return new Response("parâmetros ausentes", { status: 400 });
  }

  for (const connection of await listMetaLeadConnections()) {
    try {
      const credentials = await readMetaLeadCredentials(connection);
      if (credentials.verifyToken && credentials.verifyToken === token) {
        return new Response(challenge, { headers: { "content-type": "text/plain" } });
      }
    } catch {
      // credencial ilegível não pode derrubar a verificação das outras
    }
  }
  return new Response("token inválido", { status: 403 });
}

/**
 * Cadastro novo no anúncio.
 *
 * Responde 200 depois de autenticado, mesmo quando a gravação falha: a Meta
 * desliga o webhook após erros seguidos, e um cadastro perdido não pode custar
 * todos os próximos. A falha fica visível na tela de integração.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return Response.json({ received: true, ignored: "corpo ilegível" });
  }

  const notices = parseLeadgenNotices(payload);
  if (notices.length === 0) return Response.json({ received: true });

  const connection = await connectionByPageId(notices[0].pageId);
  if (!connection) {
    console.warn("[meta-leads] página não conectada", notices[0].pageId);
    return Response.json({ received: true, ignored: "página não conectada" });
  }

  let credentials;
  try {
    credentials = await readMetaLeadCredentials(connection);
  } catch (error) {
    console.error("[meta-leads] não consegui abrir as credenciais", error);
    return Response.json({ received: true, deferred: true });
  }

  if (!(await verifySignature(raw, request.headers.get("x-hub-signature-256"), credentials.appSecret))) {
    console.warn("[meta-leads] assinatura inválida para", connection.tenantId);
    return new Response("assinatura inválida", { status: 401 });
  }

  // um webhook só traz cadastros da mesma página
  for (const notice of notices.filter((item) => item.pageId === connection.pageId)) {
    try {
      await receiveLeadgen(connection, notice);
    } catch (error) {
      console.error("[meta-leads] falha ao gravar cadastro", notice.leadgenId, error);
      await recordMetaLeadFailure(connection.tenantId, error);
    }
  }
  return Response.json({ received: true, count: notices.length });
}
