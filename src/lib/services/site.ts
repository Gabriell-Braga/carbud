import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  stores as storesTable,
  tenantBanners,
  tenantSites,
  tenants,
  vehiclePhotos,
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
import { DEFAULT_WHATSAPP_FORM_FIELDS } from "@carbud/site-kit/catalog";
import { plateEnd } from "@/lib/format/plate";
import { mediaUrl } from "@/lib/paths";
import { tenantPublicPath } from "@/lib/tenant/resolveTenant";
import { buildSiteLinks as kitBuildSiteLinks, safeHref } from "@carbud/site-kit/links";
import { findTemplateManifest } from "@carbud/site-kit/manifests";
import { formatCurrency, formatNumber, onlyDigits } from "@/lib/utils";
import {
  composeTheme,
  type SiteData,
  type SiteLinks,
  type ThemeTokens,
  type VehicleView,
} from "@carbud/site-kit/contract";
import { tenantHasFeature } from "@/lib/api/feature-guard";
import { isInspected, type Media360, type VehicleListItem } from "./vehicles";

type AddressSource = {
  addressStreet?: string | null;
  addressNumber?: string | null;
  addressComplement?: string | null;
  addressDistrict?: string | null;
  addressCity?: string | null;
  addressState?: string | null;
  addressZip?: string | null;
} | null;

function toAddress(source: AddressSource): SiteData["contact"]["address"] {
  const parts = [
    [source?.addressStreet, source?.addressNumber].filter(Boolean).join(", "),
    source?.addressComplement,
    source?.addressDistrict,
    [source?.addressCity, source?.addressState].filter(Boolean).join(" - "),
    source?.addressZip,
  ].filter(Boolean);
  return {
    street: source?.addressStreet ?? null,
    number: source?.addressNumber ?? null,
    complement: source?.addressComplement ?? null,
    district: source?.addressDistrict ?? null,
    city: source?.addressCity ?? null,
    state: source?.addressState ?? null,
    zip: source?.addressZip ?? null,
    full: parts.length > 0 ? parts.join(" · ") : null,
  };
}

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

  /*
   * Com unidades cadastradas, o endereço do site é o delas.
   *
   * Antes a revenda preenchia o endereço duas vezes (no Site e em cada
   * unidade) e o site só lia o primeiro — quem abria a segunda loja não a via
   * no site. A unidade padrão vira o endereço principal, e as demais aparecem
   * listadas no contato. Sem o recurso no plano, as unidades não existem para
   * o site, nem as que sobraram de um plano anterior.
   */
  const storeRows = (await tenantHasFeature(row.tenant.id, "gestao_multiunidade"))
    ? await db
        .select()
        .from(storesTable)
        .where(and(eq(storesTable.tenantId, row.tenant.id), eq(storesTable.active, true)))
        .orderBy(asc(storesTable.sortOrder), asc(storesTable.name))
    : [];
  const stores = storeRows.map((store) => ({
    id: store.id,
    name: store.name,
    isDefault: store.isDefault,
    phone: formatPhoneBR(store.phone),
    whatsapp: formatPhoneBR(store.whatsapp),
    whatsappDigits: store.whatsapp ? normalizeWhatsapp(store.whatsapp) : null,
    email: store.email,
    address: toAddress(store),
  }));
  const mainStore = stores.find((store) => store.isDefault) ?? stores[0];
  const storeHasAddress = Boolean(mainStore?.address.full);
  const address = mainStore && storeHasAddress ? mainStore.address : toAddress(site);

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
    faviconDarkUrl: mediaUrl(site?.faviconDarkKey),
    theme,
    stores,
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
      // o contato central do Site vence; a unidade padrão só cobre o vazio
      phone: formatPhoneBR(site?.phone) ?? mainStore?.phone ?? null,
      whatsapp: formatPhoneBR(site?.whatsapp) ?? mainStore?.whatsapp ?? null,
      whatsappDigits: site?.whatsapp
        ? normalizeWhatsapp(site.whatsapp)
        : (mainStore?.whatsappDigits ?? null),
      whatsappForm: site?.whatsappForm ?? false,
      whatsappFormFields: site?.whatsappFormFields ?? DEFAULT_WHATSAPP_FORM_FIELDS,
      email: site?.email ?? mainStore?.email ?? null,
      address,
      // o link manual é do endereço do Site: com o da unidade, apontaria
      // para outro lugar. O filtro vale também para o que já estava salvo.
      mapsUrl: storeHasAddress ? null : safeHref(site?.mapsUrl),
      businessHours: site?.businessHours ?? [],
      social: Object.fromEntries(
        Object.entries(site?.social ?? {}).map(([network, url]) => [network, safeHref(url) ?? undefined]),
      ),
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
      ctaHref: safeHref(banner.ctaHref),
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

/** Quantas fotos o card leva: o carrossel do card não precisa da galeria inteira; a ficha mostra o resto. */
export const CARD_PHOTOS = 6;

/** Primeiras fotos de cada veículo, numa consulta só (para a página inteira de cards). */
export async function listCardPhotos(vehicleIds: string[]): Promise<Map<string, VehicleView["photos"]>> {
  const result = new Map<string, VehicleView["photos"]>();
  if (vehicleIds.length === 0) return result;
  const db = await getDb();
  const rows = await db
    .select({ id: vehiclePhotos.id, vehicleId: vehiclePhotos.vehicleId, variants: vehiclePhotos.variants })
    .from(vehiclePhotos)
    .where(inArray(vehiclePhotos.vehicleId, vehicleIds))
    .orderBy(asc(vehiclePhotos.position));
  for (const row of rows) {
    const list = result.get(row.vehicleId) ?? [];
    if (list.length >= CARD_PHOTOS) continue;
    const variants = row.variants as PhotoVariants;
    list.push({
      id: row.id,
      thumb: mediaUrl(variants.thumb) ?? "",
      card: mediaUrl(variants.card) ?? "",
      full: mediaUrl(variants.full) ?? "",
    });
    result.set(row.vehicleId, list);
  }
  return result;
}

/** `toVehicleCard` com as fotos do carrossel; é o que toda grade de site usa. */
export async function toVehicleCards(items: VehicleListItem[]): Promise<VehicleView[]> {
  const photos = await listCardPhotos(items.map((item) => item.id));
  return items.map((item) => ({ ...toVehicleCard(item), photos: photos.get(item.id) ?? [] }));
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

export const INSPECTION_RESULT_LABELS = {
  approved: "Aprovado",
  approved_with_notes: "Aprovado com ressalvas",
  rejected: "Reprovado",
} as const;

export function toVehicleDetail(
  vehicle: Vehicle,
  photos: VehiclePhoto[],
  media360: Media360 = { spin: [], pano: null },
): VehicleView {
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
    inspection:
      isInspected(vehicle) && vehicle.inspectionResult !== "rejected"
        ? {
            provider: vehicle.inspectionProvider ?? "",
            date: vehicle.inspectionDate!,
            result: vehicle.inspectionResult!,
            resultLabel: INSPECTION_RESULT_LABELS[vehicle.inspectionResult!],
            reportUrl: mediaUrl(vehicle.inspectionReportKey) ?? "",
          }
        : null,
    spin: media360.spin.map((key) => mediaUrl(key) ?? ""),
    pano: mediaUrl(media360.pano),
    storeId: vehicle.storeId,
  };
}
