/**
 * Portais de classificados que a revenda pode conectar.
 *
 * O objetivo do catálogo é tirar a configuração de fora: a revenda liga a
 * conta dela aqui, uma vez, e depois publica, atualiza e remove sem abrir o
 * portal. O passo externo que sobra é obter o acesso — e ele varia por portal,
 * então cada um traz a instrução do que pedir e a quem.
 */

export type ConnectionMethod =
  /** Redireciona para o portal, a pessoa autoriza e volta. Nada é digitado. */
  | "oauth"
  /** A revenda cola credenciais que o portal forneceu a ela. */
  | "credentials"
  /** O portal só busca o nosso feed; não há o que conectar. */
  | "feed";

/**
 * Se dá para conectar hoje ou se falta acordo comercial nosso com o portal.
 *
 * Não é fixo no catálogo: vira "pronto" quando as credenciais do NOSSO app
 * naquele portal estão no ambiente (ver portal-apps.ts). Liberar um portal é
 * cadastrar duas variáveis, sem deploy.
 */
export type PortalAvailability = "pronto" | "aguardando_acesso";

export type PortalField = {
  key: string;
  label: string;
  /** Vai para o cofre cifrado e nunca volta para a tela. */
  secret: boolean;
  hint?: string;
  /** Pode ficar em branco: liga uma parte da integração que a loja talvez não use. */
  optional?: boolean;
  /** Título do bloco no formulário; campos do mesmo grupo ficam juntos. */
  group?: string;
};

/** Endereços do fluxo OAuth 2.0 (authorization code) do portal. */
export type PortalOauth = {
  authorizeUrl: string;
  tokenUrl: string;
  /** Separado por espaço, como o portal espera no `scope`. */
  scope?: string;
  /** O portal exige PKCE (code_challenge na ida, code_verifier na troca). */
  pkce?: boolean;
};

export type PortalDefinition = {
  key: string;
  name: string;
  method: ConnectionMethod;
  /**
   * Prefixo das variáveis com as credenciais do nosso app no portal
   * (`<PREFIXO>_CLIENT_ID` e `<PREFIXO>_CLIENT_SECRET`). Sem prefixo, o
   * portal ainda não tem acesso de integrador e fica em "aguardando".
   */
  appEnvPrefix?: string;
  oauth?: PortalOauth;
  /**
   * O portal busca o estoque num endereço nosso, em vez de receber por API.
   *
   * Vale para o card de feed. É o que decide se o card mostra o endereço do
   * feed — sem ele, a loja liga para o suporte do portal sem ter o que
   * informar.
   */
  importsFeed?: boolean;
  /**
   * O portal avisa os leads de TODAS as lojas numa URL só, cadastrada no app
   * do integrador (Webmotors). A loja não cadastra endereço nenhum, e o card
   * não mostra a URL de leads com token.
   */
  appLeadWebhook?: boolean;
  /**
   * Como o portal entende "tipo de anúncio":
   * - `plan`: cada anúncio vai num tipo do plano da conta (Padrão, Destaque,
   *   Super Destaque…), com cota por tipo. Escolhe-se um padrão e, se quiser,
   *   outro por carro (Webmotors, Mercado Livre).
   * - `bump`: o anúncio é um só; destacar é uma ação que o leva ao topo e
   *   gasta saldo do plano (OLX).
   */
  adTypes?: "plan" | "bump";
  fields: PortalField[];
  /** O que a revenda precisa fazer, uma única vez, para conseguir o acesso. */
  howToConnect: string;
};

/** O que a tela recebe: a definição mais o que o ambiente decidiu. */
export type PortalCard = PortalDefinition & { availability: PortalAvailability };

export const PORTALS: PortalDefinition[] = [
  {
    key: "webmotors",
    name: "Webmotors",
    method: "credentials",
    // o client id/secret são do integrador (nós), não da loja: ficam no ambiente
    appEnvPrefix: "WEBMOTORS",
    appLeadWebhook: true,
    adTypes: "plan",
    fields: [
      {
        key: "cnpj",
        label: "CNPJ da loja",
        secret: false,
        hint: "O mesmo cadastrado no Webmotors. É por ele que o lead acha a sua loja.",
      },
      {
        key: "username",
        label: "E-mail do usuário Integrador de API",
        secret: false,
        group: "Leads",
        hint: 'Criado no Cockpit, em Usuários, com o perfil "Integrador de API".',
      },
      {
        key: "password",
        label: "Senha do usuário Integrador de API",
        secret: true,
        group: "Leads",
      },
      {
        key: "stockEmail",
        label: 'E-mail do usuário "Integração Revendedor"',
        secret: false,
        optional: true,
        group: "Publicação do estoque",
        hint: "Outro usuário, pedido ao atendimento do Webmotors pelo chat do Cockpit, para integração com gestor de estoque terceiro. Em branco, só os leads são integrados.",
      },
      {
        key: "stockPassword",
        label: 'Senha do usuário "Integração Revendedor"',
        secret: true,
        optional: true,
        group: "Publicação do estoque",
      },
    ],
    howToConnect:
      'Leads: no Cockpit, em Usuários, crie um usuário "Integrador de API" e ative a Integração com CRM de terceiros na aba Integrações. Estoque: com um plano Webmotors ativo e o termo de adesão aceito, peça ao atendimento um usuário "Integração Revendedor" para gestor de estoque terceiro. Os carros publicados por aqui aparecem no Cockpit com a etiqueta WS.',
  },
  {
    key: "icarros",
    name: "iCarros",
    method: "oauth",
    fields: [],
    howToConnect:
      "Clique em conectar: você é levado ao login do iCarros, autoriza o acesso e volta para cá. Nenhuma configuração acontece dentro do portal.",
  },
  {
    key: "olx",
    name: "OLX Autos",
    method: "oauth",
    appEnvPrefix: "OLX",
    oauth: {
      authorizeUrl: "https://auth.olx.com.br/oauth",
      tokenUrl: "https://auth.olx.com.br/oauth/token",
      // autoservice é o que deixa cadastrar a URL de leads pela API, sem a loja
      scope: "basic_user_info autoupload autoservice",
    },
    adTypes: "bump",
    fields: [],
    howToConnect:
      "Clique em conectar e autorize com a conta da loja na OLX. A integração exige um plano profissional para Empresas (Essencial, Plus ou Premium Empresa); os de autônomo não liberam a API. Os leads passam a chegar no CRM sozinhos.",
  },
  {
    key: "mercadolivre",
    name: "Mercado Livre",
    method: "oauth",
    appEnvPrefix: "MERCADOLIVRE",
    oauth: {
      authorizeUrl: "https://auth.mercadolivre.com.br/authorization",
      tokenUrl: "https://api.mercadolibre.com/oauth/token",
      // sem isso a troca volta "code_verifier is a required param"
      pkce: true,
    },
    adTypes: "plan",
    fields: [],
    howToConnect:
      "Clique em conectar e autorize com a conta da loja no Mercado Livre. A autorização é única e pode ser revogada por aqui.",
  },
  {
    key: "feed",
    name: "Outros portais (por feed)",
    method: "feed",
    importsFeed: true,
    fields: [],
    howToConnect:
      "Para portais sem API, entregue o endereço do feed de estoque. Eles buscam sozinhos e mantêm os anúncios em dia. O endereço está na tela de API e webhooks.",
  },
];

export function getPortal(key: string): PortalDefinition | undefined {
  return PORTALS.find((portal) => portal.key === key);
}

export const PORTAL_KEYS = PORTALS.map((portal) => portal.key);

/** Caminho (sem o mount path) que o portal chama de volta depois da autorização. */
export function oauthCallbackPath(portalKey: string): string {
  return `/api/portals/${portalKey}/callback`;
}
/* ------------------------------------------------------------------------ */
/* Estado da publicação                                                      */
/* ------------------------------------------------------------------------ */

export const PUBLICATION_STATUS = [
  "pendente",
  "publicado",
  "removendo",
  "removido",
  "erro",
] as const;
export type PublicationStatus = (typeof PUBLICATION_STATUS)[number];

export const PUBLICATION_LABELS: Record<PublicationStatus, string> = {
  pendente: "Aguardando envio",
  publicado: "Publicado",
  removendo: "Removendo",
  removido: "Removido",
  erro: "Erro",
};

/**
 * O que deve acontecer no portal quando o veículo muda de situação aqui.
 *
 * Vendido sai do portal na hora — anúncio de carro vendido gera lead que a
 * revenda não tem como atender, e é a reclamação número um de quem usa
 * integrador ruim. Rascunho também não vai: é ficha pela metade.
 */
export function targetPublicationStatus(vehicleStatus: string): PublicationStatus {
  if (vehicleStatus === "available" || vehicleStatus === "reserved") return "pendente";
  return "removendo";
}

/** Situações em que o anúncio deve estar no ar. */
export function shouldBePublished(vehicleStatus: string): boolean {
  return vehicleStatus === "available" || vehicleStatus === "reserved";
}
