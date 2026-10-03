import { SignJWT } from "jose/jwt/sign";
import { jwtVerify } from "jose/jwt/verify";
import { sessionSecretKey } from "@/lib/auth/session";
import { ApiError, badRequest } from "@/lib/http";
import { seal } from "@/lib/security/vault";
import type { PortalApp } from "./portal-apps";
import type { PortalDefinition, PortalOauth } from "./portals";

/**
 * Fluxo OAuth 2.0 (authorization code) com os portais.
 *
 * O portal precisa conhecer a URL de retorno de antemão — ela é cadastrada
 * junto com o nosso app lá. Por isso o caminho é fixo por portal
 * (`oauthCallbackPath`) e a origem vem do request, não de configuração.
 */

export const OAUTH_STATE_TTL_SECONDS = 10 * 60;

export type OauthState = {
  portal: string;
  tenantId: string;
  /**
   * A redirect_uri exata que foi para o portal. A troca do código exige a
   * mesma string, e o retorno precisa voltar para a mesma origem pública —
   * carregar no estado é o que garante isso mesmo se o host mudar no caminho.
   */
  redirectUri: string;
  /**
   * Verificador do PKCE, cifrado pelo cofre. O estado vai na URL e fica no
   * histórico do navegador; o verificador em claro ali anularia o PKCE.
   */
  codeVerifier?: string;
  /** O escopo pedido nesta tentativa; diz se ainda cabe recomeçar com o reduzido. */
  scope?: string;
};

/**
 * O estado vai assinado no próprio parâmetro `state` da autorização, e o
 * portal o devolve intacto. Não depende de cookie: o retorno pode chegar num
 * host que não é o do painel (proxy, URL antiga cadastrada no portal) e ainda
 * assim saber de onde veio e para onde voltar.
 *
 * O que prende o retorno à pessoa certa é a sessão: o callback exige login
 * na mesma revenda que está no estado. Estado de outra revenda é recusado.
 */
export async function signOauthState(state: OauthState): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    portal: state.portal,
    tenantId: state.tenantId,
    redirectUri: state.redirectUri,
    ...(state.codeVerifier ? { codeVerifier: state.codeVerifier } : {}),
    ...(state.scope ? { scope: state.scope } : {}),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(crypto.randomUUID())
    .setIssuedAt(now)
    .setExpirationTime(now + OAUTH_STATE_TTL_SECONDS)
    .sign(sessionSecretKey());
}

export async function verifyOauthState(token: string): Promise<OauthState | null> {
  try {
    const { payload } = await jwtVerify(token, sessionSecretKey(), { algorithms: ["HS256"] });
    if (
      typeof payload.portal !== "string" ||
      typeof payload.tenantId !== "string" ||
      typeof payload.redirectUri !== "string"
    ) {
      return null;
    }
    return {
      portal: payload.portal,
      tenantId: payload.tenantId,
      redirectUri: payload.redirectUri,
      ...(typeof payload.codeVerifier === "string" ? { codeVerifier: payload.codeVerifier } : {}),
      ...(typeof payload.scope === "string" ? { scope: payload.scope } : {}),
    };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------------ */
/* PKCE (RFC 7636)                                                           */
/* ------------------------------------------------------------------------ */

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Verificador aleatório (43 chars base64url) e o desafio S256 dele. */
export async function createPkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64Url(new Uint8Array(digest)) };
}

export function authorizeUrl(
  oauth: PortalOauth,
  app: PortalApp,
  redirectUri: string,
  state: string,
  codeChallenge?: string,
): string {
  const url = new URL(oauth.authorizeUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", app.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  if (oauth.scope) url.searchParams.set("scope", oauth.scope);
  url.searchParams.set("state", state);
  if (codeChallenge) {
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
  }
  return url.toString();
}

/**
 * URL de autorização completa: estado assinado, PKCE quando o portal pede, e
 * o escopo desta tentativa. Usada no começo do fluxo e no recomeço com o
 * escopo reduzido.
 *
 * Sem `scope`, vale o do ambiente (<PREFIXO>_OAUTH_SCOPE, para emergência)
 * ou o do catálogo.
 */
export async function startAuthorization(
  portal: PortalDefinition,
  app: PortalApp,
  tenantId: string,
  redirectUri: string,
  scope?: string,
): Promise<string> {
  if (!portal.oauth) throw badRequest(`${portal.name} não conecta por OAuth`);
  const chosen =
    scope ??
    (portal.appEnvPrefix ? process.env[`${portal.appEnvPrefix}_OAUTH_SCOPE`] : undefined) ??
    portal.oauth.scope;

  const pkce = portal.oauth.pkce ? await createPkce() : null;
  const state = await signOauthState({
    portal: portal.key,
    tenantId,
    redirectUri,
    ...(pkce ? { codeVerifier: await seal(pkce.verifier) } : {}),
    ...(chosen ? { scope: chosen } : {}),
  });
  return authorizeUrl({ ...portal.oauth, scope: chosen }, app, redirectUri, state, pkce?.challenge);
}

/**
 * O escopo reduzido para recomeçar, se ainda não foi ele o recusado.
 * Null quando não há para onde reduzir: aí o erro vai para a tela.
 */
export function fallbackScopeFor(portal: PortalDefinition, state: OauthState): string | null {
  const fallback = portal.oauth?.fallbackScope;
  if (!fallback || state.scope === fallback) return null;
  return fallback;
}

/** O que guardamos no cofre depois da autorização. Tudo string: é JSON cifrado. */
export type OauthTokens = {
  accessToken: string;
  refreshToken?: string;
  /** ISO. Ausente quando o portal não expira o token (OLX). */
  expiresAt?: string;
  /** Id da conta no portal, quando ele devolve (Mercado Livre manda `user_id`). */
  externalUserId?: string;
};

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user_id?: number | string;
  error?: string;
  error_description?: string;
  message?: string;
};

/**
 * Troca o código pelo token. Form-urlencoded porque é o que OLX e Mercado
 * Livre documentam — e o JSON no lugar dele é a causa clássica de 400 aqui.
 */
export async function exchangeCode(
  portal: PortalDefinition,
  app: PortalApp,
  redirectUri: string,
  code: string,
  codeVerifier?: string,
  fetcher: typeof fetch = fetch,
): Promise<OauthTokens> {
  if (!portal.oauth) throw badRequest(`${portal.name} não conecta por OAuth`);

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: app.clientId,
    client_secret: app.clientSecret,
    code,
    redirect_uri: redirectUri,
    ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
  });

  const response = await fetcher(portal.oauth.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body,
  });

  const payload = (await response.json().catch(() => ({}))) as TokenResponse;
  if (!response.ok || !payload.access_token) {
    const reason =
      payload.error_description ?? payload.message ?? payload.error ?? `HTTP ${response.status}`;
    throw new ApiError(502, `${portal.name} não aceitou a autorização: ${reason}`);
  }

  const tokens: OauthTokens = { accessToken: payload.access_token };
  if (payload.refresh_token) tokens.refreshToken = payload.refresh_token;
  if (typeof payload.expires_in === "number") {
    tokens.expiresAt = new Date(Date.now() + payload.expires_in * 1000).toISOString();
  }
  if (payload.user_id !== undefined) tokens.externalUserId = String(payload.user_id);
  return tokens;
}
