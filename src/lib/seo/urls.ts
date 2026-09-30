import { headers } from "next/headers";
import { BASE_PATH, withBasePath } from "@/lib/paths";
import { tenantPublicPath } from "@/lib/tenant/resolveTenant";

/**
 * Origem pública real (o app roda atrás do domínio do site Webflow).
 *
 * Atrás do proxy do Webflow Cloud o `host` que chega é o do worker
 * (`<id>.wf-app-prod.cosmic.webflow.services`), não o do site. Qualquer URL
 * montada com ele — link de e-mail, redirect_uri de OAuth, feed — sai errada
 * e sem cookie. Por isso `APP_ORIGIN` manda quando existe; os headers são o
 * plano B para dev local e outros hosts.
 */
export async function getOrigin(): Promise<string> {
  return (await describeOrigin()).origin;
}

export type OriginInfo = {
  origin: string;
  /** De onde veio: da variável ou dos cabeçalhos do request. */
  source: "env" | "headers";
  /**
   * Verdadeiro quando a origem veio dos cabeçalhos e o host é o do worker
   * interno do Webflow Cloud — ou seja, APP_ORIGIN falta e toda URL absoluta
   * está saindo com um endereço que ninguém de fora alcança.
   */
  internalHost: boolean;
};

/**
 * A origem e a confiança que dá para ter nela.
 *
 * Existe separada de `getOrigin` para a tela de configurações do super-admin
 * mostrar SE a origem está fixada — é o que decide se os endereços listados
 * ali podem ser copiados para o Mercado Livre, o Asaas e o resto. É também o
 * que muda na troca de domínio: `APP_ORIGIN` passa a ser o novo, e tudo que
 * monta URL absoluta segue junto.
 */
export async function describeOrigin(): Promise<OriginInfo> {
  const fixed = process.env.APP_ORIGIN?.replace(/\/+$/, "");
  if (fixed) return { origin: fixed, source: "env", internalHost: false };

  const headerList = await headers();
  const host =
    headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:8787";
  const proto = headerList.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  return {
    origin: `${proto}://${host}`,
    source: "headers",
    internalHost: host.endsWith(".webflow.services"),
  };
}

/**
 * URL absoluta de uma página do site da revenda, já com o mount path.
 *
 * O `withBasePath` não é detalhe: `tenantPublicPath` devolve `/r/<slug>`
 * porque é isso que o `<Link>` do Next quer (ele acrescenta o mount path
 * sozinho). Quem monta endereço absoluto — canonical, og:url, sitemap, link
 * de e-mail — precisa acrescentar à mão, senão publica
 * `https://crm.carbud.com.br/r/<slug>`, que é 404: o app vive sob `/app`.
 */
export async function tenantAbsoluteUrl(slug: string, subPath = ""): Promise<string> {
  const origin = await getOrigin();
  return `${origin}${withBasePath(tenantPublicPath(slug, subPath))}`;
}

export function absoluteFromOrigin(origin: string, path: string): string {
  if (path.startsWith("http")) return path;
  return `${origin}${path.startsWith("/") ? "" : "/"}${path}`;
}

export { BASE_PATH };
