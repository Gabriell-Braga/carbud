import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  tenantBanners,
  tenantSites,
  tenants,
  type PhotoVariants,
  type Vehicle,
  type VehiclePhoto,
} from "@/db/schema";
import { cacheKeys, cached } from "@/lib/cache";
import {
  BODY_TYPE_LABELS,
  FUEL_LABELS,
  TRANSMISSION_LABELS,
  VEHICLE_STATUS_LABELS,
} from "@/lib/catalog/labels";
import { OPTION_LABELS, VEHICLE_OPTIONS } from "@/lib/catalog/options";
import { formatPhoneBR } from "@carbud/site-kit/format";
import { plateEnd } from "@/lib/format/plate";
import { mediaUrl } from "@/lib/paths";
import { tenantPublicPath } from "@/lib/tenant/resolveTenant";
import { buildSiteLinks as kitBuildSiteLinks } from "@carbud/site-kit/links";
import { findTemplateManifest } from "@carbud/site-kit/manifests";
import { formatCurrency, formatNumber, onlyDigits } from "@/lib/utils";
import {
  composeTheme,
  type SiteData,
  type SiteLinks,
  type ThemeTokens,
  type VehicleView,
} from "@carbud/site-kit/contract";
import type { VehicleListItem } from "./vehicles";

/** Só os ids públicos de rastreamento — o que já vai para o HTML do site. */
export type PublicTrackingIds = {
  metaPixelId: string | null;
  ga4MeasurementId: string | null;
  googleAdsId: string | null;
  googleAdsLeadLabel: string | null;
  googleAdsSaleLabel: string | null;
};

/** Estrutura serializável guardada no KV (datas/URLs já resolvidas). */
type CachedSite = SiteData & {
  gtmCode: string | null;
  templateId: string;
  tracking: PublicTrackingIds;
};

const SITE_TTL = 120;

/**
 * Padrões da simulação, quando a revenda não configurou os dela.
 *
 * Ficam no serviço e não no template: o template só desenha o seletor, e
 * prazos diferentes por template fariam a mesma revenda oferecer condições
 * distintas conforme o desenho escolhido.
 */
const FINANCING_FALLBACK = { downPaymentPercent: 20, terms: [24, 36, 48, 60] };

export async function getSiteData(slug: string): Promise<CachedSite | null> {
  return cached(cacheKeys.tenantSite(slug), SITE_TTL, () => loadSiteData(slug));
}

async function loadSiteData(slug: string): Promise<CachedSite | null> {
  const db = await getDb();

  const rows = await db
    .select({ tenant: tenants, site: tenantSites })
    .from(tenants)
    .leftJoin(tenantSites, eq(tenantSites.tenantId, tenants.id))
    .where(eq(tenants.slug, slug))
    .limit(1);

  const row = rows[0];
  if (!row || row.tenant.status === "deleted") return null;

  const banners = await db
    .select()
    .from(tenantBanners)
    .where(and(eq(tenantBanners.tenantId, row.tenant.id), eq(tenantBanners.active, true)))
    .orderBy(asc(tenantBanners.position));

  const site = row.site;
  /*
   * Três camadas, nesta ordem: padrão da plataforma, desenho do template, e
   * por último o que a revenda escolheu.
   *
   * Quem não mexeu em nada vê o template como ele foi desenhado; quem trocou
   * a cor continua mandando. Inverter as duas últimas faria a escolha da
   * revenda ser sobrescrita pelo template — que é o defeito que faz alguém
   * salvar a cor de novo e concluir que o painel não guarda.
   */
  const manifest = findTemplateManifest(row.tenant.templateId);
  const theme: ThemeTokens = composeTheme(manifest?.defaultTheme, site?.theme);

  const addressParts = [
    [site?.addressStreet, site?.addressNumber].filter(Boolean).join(", "),
    site?.addressComplement,
    site?.addressDistrict,
    [site?.addressCity, site?.addressState].filter(Boolean).join(" - "),
    site?.addressZip,
  ].filter(Boolean);

  return {
    tenantId: row.tenant.id,
    templateId: row.tenant.templateId,
    // a revenda sobrescreve o GTM da plataforma quando informa o próprio código
    gtmCode: site?.gtmCode ?? row.tenant.gtmCode ?? null,
    /*
     * Só os ids PÚBLICOS: eles vão para o HTML de qualquer jeito, porque é o
     * navegador que dispara o pixel. Token da API de conversões e api_secret
     * do GA4 ficam no servidor e não passam por aqui nem por engano.
     */
    tracking: {
      metaPixelId: site?.tracking?.metaPixelId ?? null,
      ga4MeasurementId: site?.tracking?.ga4MeasurementId ?? null,
      googleAdsId: site?.tracking?.googleAdsId ?? null,
      googleAdsLeadLabel: site?.tracking?.googleAdsLeadLabel ?? null,
      googleAdsSaleLabel: site?.tracking?.googleAdsSaleLabel ?? null,
    },
    name: row.tenant.name,
    slug: row.tenant.slug,
    logoUrl: mediaUrl(site?.logoKey),
    faviconUrl: mediaUrl(site?.faviconKey),
    theme,
    aboutTitle: site?.aboutTitle ?? null,
    aboutText: site?.aboutText ?? null,
    contact: {
      /*
       * Telefone formatado AQUI, e nao no template.
       *
       * A revenda digita como quiser — so digitos, com o 55 na frente, com
       * hifen. O site mostrava esse texto cru, e um "31973065499" ao lado de
       * um "(31) 3555-0199" no card seguinte faz a pagina parecer mal montada.
       * Formatar no servico vale para os dois apps e para todo template.
       */
      phone: formatPhoneBR(site?.phone),
      whatsapp: formatPhoneBR(site?.whatsapp),
      whatsappDigits: site?.whatsapp ? normalizeWhatsapp(site.whatsapp) : null,
      whatsappForm: site?.whatsappForm ?? false,
      email: site?.email ?? null,
      address: {
        street: site?.addressStreet ?? null,
        number: site?.addressNumber ?? null,
        complement: site?.addressComplement ?? null,
        district: site?.addressDistrict ?? null,
        city: site?.addressCity ?? null,
        state: site?.addressState ?? null,
        zip: site?.addressZip ?? null,
        full: addressParts.length > 0 ? addressParts.join(" · ") : null,
      },
      mapsUrl: site?.mapsUrl ?? null,
      businessHours: site?.businessHours ?? [],
      social: site?.social ?? {},
    },
    // até três; a faixa some inteira quando não há nenhum, em vez de
    // mostrar zeros que envergonham a loja
    stats: (site?.stats ?? []).filter((stat) => stat.value && stat.label).slice(0, 3),
    reviews: (site?.reviews ?? [])
      .filter((review) => review.text?.trim())
      .slice(0, 6)
      .map((review) => ({
        // a nota é presa entre 1 e 5 aqui: banco antigo pode ter qualquer
        // número, e o template desenharia estrelas demais sem reclamar
        rating: Math.min(5, Math.max(1, Math.round(review.rating || 5))),
        text: review.text.trim(),
        author: review.author?.trim() || null,
      })),
    financing: {
      downPaymentPercent:
        site?.financing?.downPaymentPercent ?? FINANCING_FALLBACK.downPaymentPercent,
      terms: site?.financing?.terms?.length
        ? site.financing.terms
        : FINANCING_FALLBACK.terms,
    },
    legal: {
      privacy: site?.legalPrivacy ?? null,
      terms: site?.legalTerms ?? null,
      updatedAt: site?.legalUpdatedAt ? site.legalUpdatedAt.toISOString() : null,
    },
    banners: banners.map((banner) => ({
      id: banner.id,
      imageUrl: mediaUrl(banner.imageKey),
      imageUrlMobile: mediaUrl(banner.imageKeyMobile),
      title: banner.title,
      subtitle: banner.subtitle,
      ctaLabel: banner.ctaLabel,
      ctaHref: banner.ctaHref,
    })),
  };
}

/** WhatsApp precisa de DDI para o link wa.me funcionar. */
export function normalizeWhatsapp(value: string): string {
  const digits = onlyDigits(value);
  if (digits.length <= 11) return `55${digits}`;
  return digits;
}

/**
 * Links do site publico servido pelo painel, sob /r/<slug>.
 *
 * A montagem em si mora no pacote: o app dos sites monta os MESMOS links sem
 * prefixo nenhum, e duas copias divergiriam na primeira pagina nova.
 */
export function buildSiteLinks(slug: string, whatsappDigits: string | null): SiteLinks {
  return kitBuildSiteLinks(tenantPublicPath(slug), whatsappDigits);
}

function vehicleTitle(vehicle: { brand: string; model: string; version?: string | null }): string {
  return [vehicle.brand, vehicle.model, vehicle.version].filter(Boolean).join(" ");
}

function priceLabel(priceCents: number, onRequest: boolean): string {
  return onRequest || priceCents <= 0 ? "Sob consulta" : formatCurrency(priceCents);
}

/** Card de listagem — usa só o que já vem na linha do veículo (sem N+1 de fotos). */
export function toVehicleCard(vehicle: VehicleListItem): VehicleView {
  return {
    id: vehicle.id,
    slug: vehicle.slug,
    title: vehicleTitle(vehicle),
    brand: vehicle.brand,
    model: vehicle.model,
    version: vehicle.version,
    yearManufacture: vehicle.yearManufacture,
    yearModel: vehicle.yearModel,
    yearLabel: `${vehicle.yearManufacture}/${vehicle.yearModel}`,
    mileageKm: vehicle.mileageKm,
    mileageLabel: `${formatNumber(vehicle.mileageKm)} km`,
    priceCents: vehicle.priceCents,
    priceOnRequest: vehicle.priceOnRequest,
    priceLabel: priceLabel(vehicle.priceCents, vehicle.priceOnRequest),
    status: vehicle.status,
    statusLabel: VEHICLE_STATUS_LABELS[vehicle.status],
    featured: vehicle.featured,
    transmission: vehicle.transmission,
    transmissionLabel: vehicle.transmission
      ? TRANSMISSION_LABELS[vehicle.transmission]
      : null,
    fuel: vehicle.fuel,
    fuelLabel: vehicle.fuel ? FUEL_LABELS[vehicle.fuel] : null,
    bodyType: null,
    bodyTypeLabel: null,
    color: null,
    doors: null,
    licensePlateEnd: null,
    options: [],
    description: null,
    coverUrl: mediaUrl(vehicle.coverPhotoKey),
    photos: [],
  };
}

/**
 * Rótulo de emergência para opcional fora do catálogo.
 *
 * Sem isso, um veículo com chave antiga ou criada pela API mostra
 * "ar_condicionado" na página pública — texto de banco de dados exibido ao
 * cliente, que faz o site parecer quebrado. Some o traço e o sublinhado, e a
 * primeira letra sobe.
 */
function humanizeOption(key: string): string {
  const texto = key.replace(/[-_]+/g, " ").trim();
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function toVehicleDetail(vehicle: Vehicle, photos: VehiclePhoto[]): VehicleView {
  const optionKeys = vehicle.options ?? [];

  return {
    id: vehicle.id,
    slug: vehicle.slug,
    title: vehicleTitle(vehicle),
    brand: vehicle.brand,
    model: vehicle.model,
    version: vehicle.version,
    yearManufacture: vehicle.yearManufacture,
    yearModel: vehicle.yearModel,
    yearLabel: `${vehicle.yearManufacture}/${vehicle.yearModel}`,
    mileageKm: vehicle.mileageKm,
    mileageLabel: `${formatNumber(vehicle.mileageKm)} km`,
    priceCents: vehicle.priceCents,
    priceOnRequest: vehicle.priceOnRequest,
    priceLabel: priceLabel(vehicle.priceCents, vehicle.priceOnRequest),
    status: vehicle.status,
    statusLabel: VEHICLE_STATUS_LABELS[vehicle.status],
    featured: vehicle.featured,
    transmission: vehicle.transmission,
    transmissionLabel: vehicle.transmission
      ? TRANSMISSION_LABELS[vehicle.transmission]
      : null,
    fuel: vehicle.fuel,
    fuelLabel: vehicle.fuel ? FUEL_LABELS[vehicle.fuel] : null,
    bodyType: vehicle.bodyType,
    bodyTypeLabel: vehicle.bodyType ? BODY_TYPE_LABELS[vehicle.bodyType] : null,
    color: vehicle.color,
    doors: vehicle.doors,
    /*
     * O site publico mostra so o FINAL da placa, mesmo com a placa inteira no
     * banco. Publicar a placa completa identifica o veiculo para qualquer um
     * que passe pela pagina; o final e o que interessa a quem compra, por
     * causa do rodizio.
     *
     * A coluna antiga cobre os veiculos cadastrados antes de a placa inteira
     * existir — eles so tem o digito, e sem isso a ficha deles perderia a
     * informacao.
     */
    licensePlateEnd: plateEnd(vehicle.licensePlate) ?? vehicle.licensePlateEnd,
    options: optionKeys.map((key) => ({
      key,
      label: OPTION_LABELS[key] ?? humanizeOption(key),
      group: VEHICLE_OPTIONS.find((option) => option.key === key)?.group ?? "Outros",
    })),
    description: vehicle.description,
    coverUrl: mediaUrl(vehicle.coverPhotoKey),
    photos: photos.map((photo) => {
      const variants = photo.variants as PhotoVariants;
      return {
        id: photo.id,
        thumb: mediaUrl(variants.thumb) ?? "",
        card: mediaUrl(variants.card) ?? "",
        full: mediaUrl(variants.full) ?? "",
      };
    }),
  };
}
