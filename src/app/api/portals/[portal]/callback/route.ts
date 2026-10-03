import { NextResponse } from "next/server";
import { logAuditFor } from "@/lib/audit";
import { requireApiTenant } from "@/lib/auth/guards";
import { ApiError } from "@/lib/http";
import { portalApp } from "@/lib/integrations/portal-apps";
import {
  exchangeCode,
  fallbackScopeFor,
  startAuthorization,
  verifyOauthState,
} from "@/lib/integrations/portal-oauth";
import { getPortal } from "@/lib/integrations/portals";
import { withBasePath } from "@/lib/paths";
import { getOrigin } from "@/lib/seo/urls";
import { open } from "@/lib/security/vault";
import { afterOlxConnect } from "@/lib/services/portal-sync-olx";
import { connectOauthPortal, queueTenantStock } from "@/lib/services/portals";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ portal: string }> };

/**
 * Para onde o portal manda a pessoa depois de autorizar.
 *
 * É esta URL (com o mount path na frente) que se cadastra no app do portal:
 *   https://<host>/app/api/portals/<portal>/callback
 *
 * Quem chega aqui é um navegador, não uma API — então erro não vira JSON:
 * volta para a tela de portais com a mensagem, que é onde a pessoa estava.
 */
export async function GET(request: Request, { params }: Params) {
  const { portal: key } = await params;
  // sem estado válido não se sabe de onde veio: aí vale a origem dos headers
  let origin = await getOrigin();
  const back = (query: Record<string, string>) => {
    const url = new URL(withBasePath("/admin/portais"), origin);
    for (const [name, value] of Object.entries(query)) url.searchParams.set(name, value);
    return NextResponse.redirect(url);
  };

  const portal = getPortal(key);
  if (!portal || !portal.oauth) return back({ portal: key, erro: "Portal desconhecido." });

  try {
    const query = new URL(request.url).searchParams;
    const stateToken = query.get("state");
    const state = stateToken ? await verifyOauthState(stateToken) : null;
    if (!state || state.portal !== key) {
      throw new ApiError(400, "A autorização expirou ou não começou aqui. Tente conectar de novo.");
    }

    // a origem para voltar é a que iniciou o fluxo. Não dá para conferir o
    // host do request contra ela: atrás do proxy do Webflow o header é o do
    // worker interno, e a comparação entraria em loop de redirect
    origin = new URL(state.redirectUri).origin;

    // a sessão precisa ser da mesma revenda que começou o fluxo
    const context = await requireApiTenant("tenant:settings");
    if (context.tenant.id !== state.tenantId) {
      throw new ApiError(403, "A autorização foi iniciada por outra revenda.");
    }

    const app = portalApp(portal);
    if (!app) throw new ApiError(409, `${portal.name} ainda não está liberado para integração.`);

    /*
     * Permissão que o nosso app no portal não tem (invalid_scope): recomeça
     * sozinho pedindo só o necessário para publicar. A pessoa passa de novo
     * pela tela do portal, já logada, e conecta — sem erro na tela e sem
     * ninguém mexer em configuração.
     */
    const retryWithLessScope = async () => {
      const fallback = fallbackScopeFor(portal, state);
      if (!fallback) return null;
      const url = await startAuthorization(
        portal,
        app,
        state.tenantId,
        state.redirectUri,
        fallback,
      );
      return NextResponse.redirect(url);
    };

    if (query.get("error")) {
      if (query.get("error") === "invalid_scope") {
        const retry = await retryWithLessScope();
        if (retry) return retry;
      }
      const reason = query.get("error_description") ?? query.get("error") ?? "";
      throw new ApiError(400, `${portal.name} não autorizou o acesso. ${reason}`.trim());
    }
    const code = query.get("code");
    if (!code) throw new ApiError(400, `${portal.name} voltou sem o código de autorização.`);

    const codeVerifier = state.codeVerifier ? await open(state.codeVerifier) : undefined;
    let tokens;
    try {
      tokens = await exchangeCode(portal, app, state.redirectUri, code, codeVerifier);
    } catch (error) {
      // a OLX também pode recusar o escopo só na troca do código
      if (error instanceof ApiError && /invalid_scope/.test(error.message)) {
        const retry = await retryWithLessScope();
        if (retry) return retry;
      }
      throw error;
    }
    await connectOauthPortal(context.tenant.id, context.user.id, key, tokens);
    await queueTenantStock(context.tenant.id);

    // OLX: a URL de leads é cadastrada pela API; se falhar, o card avisa e a sincronização tenta de novo
    if (key === "olx") {
      await afterOlxConnect(context.tenant.id, origin).catch((error) =>
        console.warn("[portais] leads da OLX não configurados na conexão", error),
      );
    }

    await logAuditFor(
      context,
      { action: "portal.connect", entity: "portal_connection", entityId: key },
      request,
    );
    return back({ portal: key, conectado: "1" });
  } catch (error) {
    if (error instanceof ApiError) return back({ portal: key, erro: error.message });
    console.error("[portais] retorno OAuth falhou:", error);
    return back({ portal: key, erro: "Não consegui concluir a conexão. Tente de novo." });
  }
}
