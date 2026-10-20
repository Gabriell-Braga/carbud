import { panelUrl } from "~/lib/panel-url";

export const dynamic = "force-dynamic";

/**
 * Repasse dos formulários para o painel.
 *
 * Os formulários são os MESMOS componentes do painel, e eles enviam para
 * `/api/leads` do próprio site. Aqui esse endereço é o domínio da revenda, não
 * o do painel — sem este repasse, todo envio daria 404.
 *
 * Fazer o formulário chamar o painel direto exigiria CORS e colocaria o
 * endereço da plataforma dentro do código-fonte do site do cliente. Passando
 * por aqui, o navegador só conversa com o domínio da loja.
 */
export async function POST(request: Request) {
  const sitesKey = process.env.SITES_API_KEY ?? "";
  const visitorIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const userAgent = request.headers.get("user-agent");

  const response = await fetch(`${panelUrl()}/api/leads`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(sitesKey ? { "x-sites-key": sitesKey } : {}),
      /*
       * O IP e o navegador de quem enviou.
       *
       * Sem eles o painel veria todos os leads chegando dos endereços da
       * Vercel: o limite por IP cairia sobre todas as revendas de uma vez, e a
       * API de Conversões da Meta receberia o IP e o user-agent do servidor.
       * Não vai em `x-forwarded-for` porque na Cloudflare o painel lê
       * `cf-connecting-ip`, que é o da Vercel; `x-visitor-ip` só vale com a
       * chave (ver `clientIp`).
       */
      ...(visitorIp ? { "x-visitor-ip": visitorIp } : {}),
      ...(userAgent ? { "user-agent": userAgent } : {}),
    },
    body: await request.text(),
  });

  // a resposta do painel passa inteira: o formulário sabe ler os erros dele
  return new Response(await response.text(), {
    status: response.status,
    headers: { "content-type": "application/json" },
  });
}
