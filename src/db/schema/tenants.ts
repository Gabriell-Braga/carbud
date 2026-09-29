import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createdAt, idColumn, updatedAt } from "./_shared";

export const TENANT_STATUS = ["active", "suspended", "deleted"] as const;
export type TenantStatus = (typeof TENANT_STATUS)[number];

/** Como o painel da revenda se comporta quando ela está suspensa. */
export const BLOCK_MODES = ["readonly", "full"] as const;
export type BlockMode = (typeof BLOCK_MODES)[number];

export const tenants = sqliteTable(
  "tenants",
  {
    id: idColumn(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    legalName: text("legal_name"),
    cnpj: text("cnpj"),
    status: text("status").$type<TenantStatus>().notNull().default("active"),
    templateId: text("template_id").notNull().default("template-1-clean"),
    blockMode: text("block_mode").$type<BlockMode>().notNull().default("readonly"),
    /** GTM definido pela plataforma; a revenda pode sobrescrever em tenant_sites.gtm_code. */
    gtmCode: text("gtm_code"),
    /** Plano contratado. Sem plano, a revenda roda com os limites de fallback. */
    planId: text("plan_id"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    uniqueIndex("tenants_slug_unique").on(table.slug),
    index("tenants_status_idx").on(table.status),
  ],
);

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;

/** Cores/fontes customizáveis do template — viram CSS variables no site público. */
export type TenantTheme = {
  primary?: string;
  primaryForeground?: string;
  accent?: string;
  surface?: string;
  fontHeading?: string;
  fontBody?: string;
};

export type BusinessHours = {
  /** 0 = domingo … 6 = sábado */
  weekday: number;
  open: string | null;
  close: string | null;
}[];

export type SocialLinks = {
  instagram?: string;
  facebook?: string;
  youtube?: string;
  tiktok?: string;
};

/**
 * Conectores de mídia da revenda: o que identifica as contas de anúncio.
 *
 * Só o que é PÚBLICO mora aqui — id de pixel, id de medição, id da conta de
 * anúncios, rótulo de conversão. Tudo isso já vai para o navegador de quem
 * visita o site, então guardar em claro não revela nada que a página não
 * revele. Os segredos (token da API de conversões, api_secret do GA4) ficam
 * cifrados em `trackingSecrets`.
 */
export type TrackingSettings = {
  /** Meta (Facebook/Instagram): id do pixel. */
  metaPixelId?: string;
  /** Google Analytics 4: "G-XXXXXXX". */
  ga4MeasurementId?: string;
  /** Google Ads: "AW-123456789". */
  googleAdsId?: string;
  /** Rótulo da conversão de lead no Google Ads ("AbC-D_efGh"). */
  googleAdsLeadLabel?: string;
  /** Rótulo da conversão de venda no Google Ads. */
  googleAdsSaleLabel?: string;
  /** Liga o envio pelo servidor (API de Conversões e Measurement Protocol). */
  serverSide?: boolean;
};

/**
 * Os segredos dos conectores, cifrados no cofre.
 *
 * Token de API de conversões dá poder de gravar eventos na conta de anúncios
 * da revenda; api_secret do GA4, na propriedade dela. Nenhum dos dois pode
 * chegar ao navegador nem voltar para a tela depois de salvo.
 */
export type TrackingSecrets = {
  metaAccessToken?: string;
  ga4ApiSecret?: string;
};

/** Ver `lib/services/notifications.ts`: quem recebe aviso, e de quê. */
export type NotificationSettings = {
  newLead?: boolean;
  leadRecipients?: string[];
  notifyAssignee?: boolean;
};

export type SeoSettings = {
  titleTemplate?: string;
  defaultDescription?: string;
  ogImageKey?: string;
};

/**
 * Números de vitrine da revenda: "+300 / veículos vendidos".
 *
 * Valor é texto, não número: a revenda escreve "+300", "4,9/5" e "10 anos" na
 * mesma faixa, que não são a mesma grandeza. Formatar isso do nosso lado
 * transformaria "4,9/5" em algo errado.
 */
export type SiteStats = { value: string; label: string }[];

/**
 * Depoimento de cliente, como o desenho mostra no Sobre.
 *
 * Cadastrado pela revenda, não sincronizado de fora — o desenho diz
 * "podem ser sincronizadas ou cadastradas pela loja", e a sincronização
 * depende de integração com Google ou Meta, que não existe. Cadastrar é o
 * caminho que funciona hoje.
 */
export type SiteReviews = { rating: number; text: string; author: string | null }[];

/** O que a simulação de financiamento assume antes de a pessoa mexer. */
export type FinancingDefaults = {
  downPaymentPercent?: number;
  terms?: number[];
};

/** Dados de apresentação/CMS do site — separados de `tenants` para cachear fácil no KV. */
export const tenantSites = sqliteTable("tenant_sites", {
  tenantId: text("tenant_id")
    .primaryKey()
    .references(() => tenants.id, { onDelete: "cascade" }),
  logoKey: text("logo_key"),
  faviconKey: text("favicon_key"),
  theme: text("theme", { mode: "json" }).$type<TenantTheme>(),
  gtmCode: text("gtm_code"),
  phone: text("phone"),
  whatsapp: text("whatsapp"),
  email: text("email"),
  addressStreet: text("address_street"),
  addressNumber: text("address_number"),
  addressComplement: text("address_complement"),
  addressDistrict: text("address_district"),
  addressCity: text("address_city"),
  addressState: text("address_state"),
  addressZip: text("address_zip"),
  mapsUrl: text("maps_url"),
  businessHours: text("business_hours", { mode: "json" }).$type<BusinessHours>(),
  social: text("social", { mode: "json" }).$type<SocialLinks>(),
  aboutTitle: text("about_title"),
  aboutText: text("about_text"),
  seo: text("seo", { mode: "json" }).$type<SeoSettings>(),
  tracking: text("tracking", { mode: "json" }).$type<TrackingSettings>(),
  /** Avisos por e-mail da operação (lead novo, e para quem). */
  notifications: text("notifications", { mode: "json" }).$type<NotificationSettings>(),
  /** Blob do cofre com os segredos dos conectores; nunca volta para a tela. */
  trackingSecrets: text("tracking_secrets"),
  stats: text("stats", { mode: "json" }).$type<SiteStats>(),
  financing: text("financing", { mode: "json" }).$type<FinancingDefaults>(),
  reviews: text("reviews", { mode: "json" }).$type<SiteReviews>(),
  /*
   * Privacidade e termos ficam como texto da revenda, não como página nossa.
   *
   * O conteúdo é jurídico e responde pela empresa dela — publicar um texto
   * genérico assinado pela revenda seria colocar a loja para responder por
   * uma promessa que ninguém leu. Vazio esconde a página em vez de mostrar
   * uma casca sem conteúdo.
   */
  legalPrivacy: text("legal_privacy"),
  legalTerms: text("legal_terms"),
  legalUpdatedAt: integer("legal_updated_at", { mode: "timestamp_ms" }),
  updatedAt: updatedAt(),
});

export type TenantSite = typeof tenantSites.$inferSelect;
export type NewTenantSite = typeof tenantSites.$inferInsert;

export const tenantBanners = sqliteTable(
  "tenant_banners",
  {
    id: idColumn(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    imageKey: text("image_key").notNull(),
    imageKeyMobile: text("image_key_mobile"),
    title: text("title"),
    subtitle: text("subtitle"),
    ctaLabel: text("cta_label"),
    ctaHref: text("cta_href"),
    position: integer("position").notNull().default(0),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: createdAt(),
  },
  (table) => [index("tenant_banners_tenant_idx").on(table.tenantId, table.position)],
);

export type TenantBanner = typeof tenantBanners.$inferSelect;
