import {
  PORTALS,
  type PortalAvailability,
  type PortalCard,
  type PortalDefinition,
} from "./portals";

/**
 * Credenciais do NOSSO app em cada portal.
 *
 * São do integrador, obtidas uma vez com o portal, e valem para todas as
 * revendas — a conta de cada loja é o que a revenda autoriza depois. Por isso
 * vivem no ambiente (secrets do Webflow Cloud), não no banco nem no catálogo.
 */
export type PortalApp = { clientId: string; clientSecret: string };

export function portalApp(portal: PortalDefinition): PortalApp | null {
  if (!portal.appEnvPrefix) return null;
  const clientId = process.env[`${portal.appEnvPrefix}_CLIENT_ID`];
  const clientSecret = process.env[`${portal.appEnvPrefix}_CLIENT_SECRET`];
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

/**
 * Feed está sempre pronto: não há o que autenticar. Portal de credenciais
 * sem app nosso (Chaves na Mão: o token é da loja) também. Os outros ficam
 * prontos quando o app tem credenciais — e, no OAuth, quando sabemos para
 * onde mandar.
 */
export function portalAvailability(portal: PortalDefinition): PortalAvailability {
  if (portal.method === "feed") return "pronto";
  if (portal.method === "oauth" && !portal.oauth) return "aguardando_acesso";
  if (portal.method === "credentials" && !portal.appEnvPrefix) return "pronto";
  return portalApp(portal) ? "pronto" : "aguardando_acesso";
}

export function portalCards(): PortalCard[] {
  return PORTALS.map((portal) => ({ ...portal, availability: portalAvailability(portal) }));
}
