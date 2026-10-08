import { jsonOk, notFound, tooManyRequests, withApi } from "@/lib/http";
import {
  normalizeInboundLead,
  tenantFromLeadToken,
} from "@/lib/integrations/portal-lead-inbox";
import { getPortal } from "@/lib/integrations/portals";
import { rateLimit } from "@/lib/ratelimit";
import { registerPortalLead } from "@/lib/services/portal-leads";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ portal: string }> };

/**
 * Entrada de leads de um portal de classificados.
 *
 * É o endereço que a loja (ou o integrador dela) cadastra no portal como
 * "URL de leads". Vale para QUALQUER portal: o Mercado Livre, que também
 * tem API de perguntas, e a OLX, o Webmotors e os que só recebem
 * nosso feed — para esses, é o único caminho que existe hoje, e é o que faz
 * o lead deles aparecer no CRM em vez de ficar só no e-mail do vendedor.
 *
 * Autenticação pelo token da URL, derivado do AUTH_SECRET (ver
 * `portal-lead-inbox`). Quem tem a URL só consegue criar lead naquela
 * revenda e naquele portal — é o mesmo poder de quem preenche o formulário
 * do site, e por isso também é limitado por taxa.
 *
 * Responde 200 com uma explicação até quando recusa o conteúdo: portal que
 * leva erro HTTP costuma desligar a integração depois de algumas tentativas,
 * e aí a loja para de receber lead sem ninguém perceber. O motivo vai no
 * corpo, que é onde o integrador consegue ler.
 */
export const POST = withApi(async (request: Request, { params }: Params) => {
  const { portal: key } = await params;
  const portal = getPortal(key);
  if (!portal) throw notFound("Portal desconhecido");

  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? request.headers.get("x-carbud-token") ?? "";
  const tenantId = token ? await tenantFromLeadToken(token, key) : null;
  if (!tenantId) throw notFound("Endereço inválido ou token de outra revenda.");

  /*
   * Teto por revenda: o token é uma URL que circula por fora (fica cadastrada
   * no painel do portal, às vezes passa por integrador). Sem limite, quem a
   * obtivesse poderia encher o CRM da loja.
   */
  const limit = await rateLimit(`portal-lead:${tenantId}`, 300, 3600);
  if (!limit.allowed) throw tooManyRequests();

  const body = await readBody(request);
  const parsed = normalizeInboundLead(key, body);
  if (!parsed.ok) {
    // 200 de propósito, com o motivo no corpo — ver o comentário acima
    return jsonOk({ received: false, reason: parsed.reason });
  }

  const outcome = await registerPortalLead(tenantId, parsed.lead);
  return jsonOk({ received: true, outcome });
});

/**
 * JSON é o comum, mas há portal e integrador que mandam formulário.
 * Recusar o segundo por causa do cabeçalho seria perder lead por formato.
 */
async function readBody(request: Request): Promise<unknown> {
  const type = request.headers.get("content-type") ?? "";

  if (type.includes("json")) return request.json().catch(() => null);

  if (type.includes("form")) {
    const form = await request.formData().catch(() => null);
    if (!form) return null;
    return Object.fromEntries([...form.entries()].map(([name, value]) => [name, String(value)]));
  }

  // sem cabeçalho confiável: tenta JSON e desiste em silêncio
  const text = await request.text().catch(() => "");
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * GET existe para a pessoa conferir o endereço colando no navegador.
 *
 * Sem ele, testar a URL devolveria 405 e pareceria endereço errado — o que
 * manda a loja procurar defeito onde não há. Não cria lead nem revela nada
 * da revenda além de o token ser válido.
 */
export const GET = withApi(async (request: Request, { params }: Params) => {
  const { portal: key } = await params;
  const portal = getPortal(key);
  if (!portal) throw notFound("Portal desconhecido");

  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const tenantId = token ? await tenantFromLeadToken(token, key) : null;
  if (!tenantId) throw notFound("Endereço inválido ou token de outra revenda.");

  return jsonOk({
    ok: true,
    portal: portal.name,
    comoUsar:
      "Cadastre este endereço no portal como URL de leads e mande um POST com nome, telefone ou e-mail, mensagem e o código do anúncio.",
  });
});
