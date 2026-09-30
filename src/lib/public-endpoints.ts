import { PORTALS, oauthCallbackPath, type PortalDefinition } from "@/lib/integrations/portals";
import { withBasePath } from "@/lib/paths";

export type PublicEndpoint = {
  /** O que é. */
  label: string;
  /** Onde precisa estar cadastrado fora do app. */
  where: string;
  url: string;
};

export type PublicEndpointGroup = {
  key: string;
  /** O serviço de fora onde esses endereços são cadastrados. */
  title: string;
  /** O que a pessoa precisa saber antes de copiar os endereços do grupo. */
  description: string;
  endpoints: PublicEndpoint[];
};

/**
 * O que muda de portal para portal na hora de cadastrar os endereços.
 *
 * Cada portal chama os campos do jeito dele, e é aí que o suporte trava: o
 * admin abre o cadastro do Webmotors, vê "CALLBACK URL LEADS" e "CALLBACK URL
 * ESTOQUE" e pergunta qual dos endereços da lista vai em cada campo. Aqui a
 * resposta vem escrita com o nome que o portal usa na tela dele.
 */
const PORTAL_NOTES: Record<
  string,
  { intro?: string; leads?: string; feed?: string; leadsLabel?: string; feedLabel?: string }
> = {
  webmotors: {
    intro:
      "Vai no app carbud do portal de desenvolvedores do Webmotors, uma vez, e vale para todas as revendas. Só o campo CALLBACK URL LEADS: o CALLBACK URL ESTOQUE fica vazio. Cada revenda conecta com o usuário Integrador de API dela, na tela de Portais.",
    leadsLabel: "Avisos de lead — campo CALLBACK URL LEADS",
  },
  feed: {
    intro:
      "Portais sem API: eles só buscam o feed e mandam o lead de volta. Nada a conectar, nada a autorizar.",
  },
  mercadolivre: {
    intro:
      'Além do retorno do OAuth, o app do Mercado Livre tem a URL de notificações. Marque o tópico "questions": é ele que traz as perguntas dos anúncios, que viram lead no CRM.',
  },
};

/** Endereços de um portal: retorno do OAuth, URL de leads e feed de estoque. */
function portalGroup(portal: PortalDefinition, at: (path: string) => string): PublicEndpointGroup {
  const notes = PORTAL_NOTES[portal.key] ?? {};
  const endpoints: PublicEndpoint[] = [];

  if (portal.method === "oauth") {
    endpoints.push({
      label: "Retorno do OAuth",
      where: `App do integrador no ${portal.name} (redirect URI)`,
      url: at(oauthCallbackPath(portal.key)),
    });
  }

  if (portal.key === "mercadolivre") {
    endpoints.push({
      label: "Notificações",
      where:
        'App do integrador no Mercado Livre (URL de callback de notificações), com o tópico "questions" marcado',
      url: at("/api/webhooks/mercadolivre"),
    });
  }

  if (portal.appLeadWebhook) {
    endpoints.push({
      label: notes.leadsLabel ?? "Avisos de lead",
      where: `App do integrador no ${portal.name}. Um endereço só: o aviso traz o CNPJ, que diz de qual revenda é o lead`,
      url: at(`/api/webhooks/${portal.key}`),
    });
  } else {
    endpoints.push({
      label: notes.leadsLabel ?? "URL de leads",
      where: [
        `Cada revenda cadastra a URL dela no ${portal.name}. O endereço completo, com o token, está em Portais, no card do portal`,
        notes.leads,
        "O token não muda com o domínio, mas o começo do endereço sim: depois da troca, as revendas precisam recadastrar",
      ]
        .filter(Boolean)
        .join(". "),
      url: at(`/api/portals/${portal.key}/leads?token=...`),
    });
  }

  if (portal.importsFeed) {
    endpoints.push({
      label: notes.feedLabel ?? "Feed de estoque",
      where: [
        `Cadastrado no ${portal.name}, que importa o estoque por URL. Também há a versão .json no mesmo caminho`,
        notes.feed,
      ]
        .filter(Boolean)
        .join(". "),
      url: at("/r/<slug>/estoque.xml"),
    });
  }

  return {
    key: portal.key,
    title: portal.name,
    description: notes.intro ?? `Endereços deste app que ficam cadastrados no ${portal.name}.`,
    endpoints,
  };
}

/**
 * Todo endereço deste app que alguém DE FORA precisa conhecer, por serviço.
 *
 * É a lista da troca de domínio: quando `APP_ORIGIN` muda, cada um destes
 * precisa ser recadastrado no serviço correspondente, senão o retorno do
 * OAuth cai no domínio antigo, o Asaas avisa um endereço que não existe mais
 * e a rotina diária chama o lugar errado. A separação por portal é o que o
 * suporte usa: a pergunta que chega nunca é "quais são os endereços", é
 * "o que eu ponho no cadastro do Webmotors". O código nunca fixa domínio.
 */
export function publicEndpointGroups(origin: string): PublicEndpointGroup[] {
  const at = (path: string) => `${origin}${withBasePath(path)}`;

  return [
    ...PORTALS.map((portal) => portalGroup(portal, at)),
    {
      key: "cobranca-e-mensagens",
      title: "Asaas e WhatsApp",
      description: "Serviços que avisam este app quando algo acontece do lado deles.",
      endpoints: [
        {
          label: "Webhook do Asaas",
          where: "Asaas → Integrações → Webhooks",
          url: at("/api/webhooks/asaas"),
        },
        {
          label: "Webhook do WhatsApp",
          where:
            "Meta for Developers → app do WhatsApp → Webhooks (por revenda; a tela de mensagens mostra o mesmo endereço)",
          url: at("/api/webhooks/whatsapp"),
        },
      ],
    },
    {
      key: "rotinas-e-apps",
      title: "Rotinas e apps nossos",
      description: "Endereços que ficam em variáveis de ambiente, não em portal de terceiro.",
      endpoints: [
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
      ],
    },
  ];
}

/** A mesma lista sem os grupos, para quem só precisa dos endereços. */
export function publicEndpoints(origin: string): PublicEndpoint[] {
  return publicEndpointGroups(origin).flatMap((group) => group.endpoints);
}
