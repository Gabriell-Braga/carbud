/**
 * O nome do produto, num lugar só.
 *
 * O app nasceu como "ProjetoAuto" e virou **Carbud**. Tudo que mostra o nome
 * (aba do navegador, login, e-mail, user-agent, cabeçalhos de webhook) lê
 * daqui — a próxima troca de nome é uma linha, não uma caçada por strings.
 *
 * O que NÃO muda com o nome: os identificadores de infraestrutura
 * (`wrangler.json`, banco `projetoauto-db`, bucket `projetoauto-media`). São
 * nomes de recursos já criados no Webflow Cloud; renomear quebraria os
 * bindings sem ganhar nada — ninguém de fora os vê.
 *
 * Domínios: o painel (home, página de vendas e sistema) vai para
 * `crm.carbud.com.br`; o domínio raiz `carbud.com.br` fica com o portal
 * proprietário. O código não fixa nenhum
 * deles: a origem pública vem de `APP_ORIGIN` (ver `lib/seo/urls.ts`), e o
 * mount path de `BASE_URL`, que o Webflow Cloud injeta. Trocar de domínio é
 * trocar variáveis e recadastrar os endereços listados em
 * `publicEndpoints()` — nunca editar código.
 */
export const APP_NAME = "Carbud";

/** Como o nome aparece na aba: "Estoque · Carbud". */
export const APP_TITLE_TEMPLATE = `%s · ${APP_NAME}`;

export const APP_DESCRIPTION =
  "Painel de gestão de estoque e sites para revendas de veículos.";

/** Identifica o app nas chamadas que fazemos para fora (Asaas, WhatsApp, webhooks). */
export const USER_AGENT = APP_NAME;

/**
 * Prefixo dos cabeçalhos que assinam os webhooks enviados às integrações
 * das revendas. Quem já consome os webhooks precisa saber deste nome —
 * está na tela de integrações.
 */
export const WEBHOOK_HEADER_EVENT = "x-carbud-event";
export const WEBHOOK_HEADER_SIGNATURE = "x-carbud-signature";

/**
 * GTM do marketing (o mesmo container da página de planos no Webflow). Só o
 * checkout público carrega: é onde o funil de contratação termina, com os
 * eventos de e-commerce do GA4 no dataLayer.
 */
export const MARKETING_GTM_ID = "GTM-NTSXCK4Z";
