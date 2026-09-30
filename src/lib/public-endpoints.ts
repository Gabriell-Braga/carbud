import { PORTALS, oauthCallbackPath } from "@/lib/integrations/portals";
import { withBasePath } from "@/lib/paths";

export type PublicEndpoint = {
  /** O que é. */
  label: string;
  /** Onde precisa estar cadastrado fora do app. */
  where: string;
  url: string;
};

/**
 * Todo endereço deste app que alguém DE FORA precisa conhecer.
 *
 * É a lista da troca de domínio: quando `APP_ORIGIN` muda, cada um destes
 * precisa ser recadastrado no serviço correspondente, senão o retorno do
 * OAuth cai no domínio antigo, o Asaas avisa um endereço que não existe mais
 * e a rotina diária chama o lugar errado. A tela de configurações do
 * super-admin mostra a lista pronta para copiar; o código nunca fixa domínio.
 */
export function publicEndpoints(origin: string): PublicEndpoint[] {
  const at = (path: string) => `${origin}${withBasePath(path)}`;

  const oauth = PORTALS.filter((portal) => portal.method === "oauth").map((portal) => ({
    label: `Retorno do OAuth — ${portal.name}`,
    where: `App do integrador no ${portal.name} (redirect URI)`,
    url: at(oauthCallbackPath(portal.key)),
  }));

  return [
    ...oauth,
    {
      label: "Notificações do Mercado Livre",
      where:
        "App do integrador no Mercado Livre (URL de callback de notificações). Marque o tópico \"questions\": é ele que traz as perguntas dos anúncios, que viram lead no CRM",
      url: at("/api/webhooks/mercadolivre"),
    },
    {
      label: "Leads dos portais (uma URL por revenda)",
      where:
        "Cada revenda cadastra a URL dela no portal como \"URL de leads\". Vale para TODOS: Webmotors, OLX, iCarros, Mercado Livre e os que só recebem feed. O endereço completo, com o token, está em Portais, no card de cada portal. O token não muda com o domínio, mas o começo do endereço sim: depois da troca, as revendas precisam recadastrar",
      url: at("/api/portals/<portal>/leads?token=..."),
    },
    {
      label: "Feed de estoque (uma URL por revenda)",
      where:
        "Cadastrado no portal que importa por URL — é o caso do Webmotors, que junto com a URL de leads forma o par dele. Também há a versão .json no mesmo caminho. Quando a revenda tem domínio próprio, o portal deve receber o endereço DELA (https://dominio-da-loja/estoque.xml), que não passa por aqui",
      url: at("/r/<slug>/estoque.xml"),
    },
    {
      label: "Webhook do Asaas",
      where: "Asaas → Integrações → Webhooks",
      url: at("/api/webhooks/asaas"),
    },
    {
      label: "Webhook do WhatsApp",
      where: "Meta for Developers → app do WhatsApp → Webhooks (por revenda; a tela de mensagens mostra o mesmo endereço)",
      url: at("/api/webhooks/whatsapp"),
    },
    {
      label: "Rotina diária (cobrança e faxina)",
      where: "GitHub → Settings → Variables → OPS_BASE_URL (sem o /api/ops)",
      url: at("/api/ops/billing"),
    },
    {
      label: "Sincronização dos portais",
      where: "Agendador externo, junto com a rotina diária",
      url: at("/api/ops/sync-portals"),
    },
    {
      label: "Leitura dos sites (app da Vercel)",
      where: "Vercel → Environment Variables → PANEL_URL (este endereço, sem o /api)",
      url: at("/api/public"),
    },
  ];
}
