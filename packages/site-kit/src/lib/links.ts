import type { SiteLinks } from "../templates/contract";

/**
 * Os enderecos que o template usa para navegar.
 *
 * O mesmo site vive em dois lugares: no painel, sob `/r/<slug>`; no dominio da
 * revenda, na raiz. O que muda entre os dois e SO o prefixo — as paginas, os
 * nomes e a query string sao os mesmos. Por isso o prefixo e argumento, e nao
 * duas funcoes parecidas que alguem vai esquecer de atualizar junto.
 *
 * `prefix` vem sem barra no fim: "" para dominio proprio, "/r/loja" no painel.
 */
export function buildSiteLinks(prefix: string, whatsappDigits: string | null): SiteLinks {
  const at = (subPath = "") => `${prefix}${subPath}` || "/";

  return {
    home: at(),
    stock: at("/estoque"),
    contact: at("/contato"),
    financing: at("/financiamento"),
    sellCar: at("/venda-seu-carro"),
    about: at("/sobre"),
    privacy: at("/privacidade"),
    terms: at("/termos"),
    vehicle: (vehicleSlug: string) => at(`/veiculo/${vehicleSlug}`),
    stockWith: (params) => {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== "") query.set(key, String(value));
      }
      const suffix = query.toString();
      return at(suffix ? `/estoque?${suffix}` : "/estoque");
    },
    whatsapp: (message: string) =>
      whatsappDigits
        ? `https://wa.me/${whatsappDigits}?text=${encodeURIComponent(message)}`
        : null,
  };
}

/**
 * Link cadastrado pela loja, só se for seguro virar `href` no site público.
 *
 * Mapa, botão do banner e redes sociais são digitados no painel e renderizados
 * para todo visitante: um `javascript:` ali executaria no navegador de quem
 * visita. Passa http(s), caminho interno ("/estoque", não "//outro-site"),
 * âncora, mailto e tel; o resto vira null e o link some.
 *
 * Domínio sem protocolo ("instagram.com/loja", que é como quase todo mundo
 * digita) ganha o https:// — sem ele o navegador trataria como caminho do
 * próprio site e o link quebraria.
 */
export function safeHref(value: string | null | undefined): string | null {
  const href = value?.trim();
  if (!href) return null;
  if (/^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+([/?#]\S*)?$/i.test(href)) return `https://${href}`;
  if (/^https?:\/\//i.test(href)) return href;
  if (/^\/(?!\/)/.test(href) || href.startsWith("#")) return href;
  if (/^(mailto|tel):/i.test(href)) return href;
  return null;
}
