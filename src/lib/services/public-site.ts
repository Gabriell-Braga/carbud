import { notFound, redirect } from "next/navigation";
import { getTenantCoreBySlug, isPublicSiteAvailable } from "@/lib/tenant/service";
import { tenantPublicPath } from "@/lib/tenant/resolveTenant";
import { buildSiteLinks, getSiteData } from "./site";
import { applySitePreview, readSitePreview } from "./site-preview";
import type { AppliedFilters, SiteData, SiteLinks } from "@carbud/site-kit/contract";
import type { VehicleFilters } from "@/lib/validation/vehicles";
import { getTemplate } from "@carbud/site-kit/registry";
import type { TemplateModule } from "@carbud/site-kit/contract";

export type PublicContext = {
  site: SiteData;
  links: SiteLinks;
  template: TemplateModule;
  templateId: string;
  gtmCode: string | null;
  tenantId: string;
};

/**
 * Carrega tudo que o site público precisa.
 * Revenda inexistente => 404. Revenda suspensa/inadimplente => página neutra
 * de indisponibilidade (sem expor o motivo).
 */
export async function loadPublicSite(slug: string): Promise<PublicContext> {
  const tenant = await getTenantCoreBySlug(slug);
  if (!tenant) notFound();

  if (!isPublicSiteAvailable(tenant)) {
    redirect(tenantPublicPath(slug, "/indisponivel"));
  }

  const saved = await getSiteData(slug);
  if (!saved) notFound();
  const site = applySitePreview(saved, await readSitePreview(slug));

  return {
    site,
    links: buildSiteLinks(slug, site.contact.whatsappDigits),
    template: getTemplate(site.templateId),
    templateId: site.templateId,
    gtmCode: site.gtmCode,
    tenantId: site.tenantId,
  };
}

type RawParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

function toInt(value: string | string[] | undefined): number | undefined {
  const raw = firstValue(value);
  if (!raw) return undefined;
  const parsed = Number(raw.replace(/\D/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

const SORTS = ["recentes", "preco-asc", "preco-desc", "km-asc", "ano-desc"] as const;

/** Query string em pt-BR -> filtros internos. */
export function parsePublicFilters(params: RawParams): {
  filters: Partial<VehicleFilters>;
  applied: AppliedFilters;
} {
  const sortRaw = firstValue(params.ordem);
  const sort = (SORTS as readonly string[]).includes(sortRaw ?? "")
    ? (sortRaw as VehicleFilters["sort"])
    : "recentes";

  const priceMinReais = toInt(params.precoMin);
  const priceMaxReais = toInt(params.precoMax);

  const filters: Partial<VehicleFilters> = {
    search: firstValue(params.q),
    brand: firstValue(params.marca),
    model: firstValue(params.modelo),
    transmission: firstValue(params.cambio) as VehicleFilters["transmission"],
    fuel: firstValue(params.combustivel) as VehicleFilters["fuel"],
    bodyType: firstValue(params.carroceria) as VehicleFilters["bodyType"],
    priceMin: priceMinReais ? priceMinReais * 100 : undefined,
    priceMax: priceMaxReais ? priceMaxReais * 100 : undefined,
    yearMin: toInt(params.anoMin),
    yearMax: toInt(params.anoMax),
    kmMax: toInt(params.kmMax),
    sort,
    page: toInt(params.pagina) ?? 1,
    pageSize: 12,
  };

  return {
    filters,
    applied: {
      search: filters.search,
      brand: filters.brand,
      model: filters.model,
      transmission: filters.transmission,
      fuel: filters.fuel,
      bodyType: filters.bodyType,
      priceMin: filters.priceMin,
      priceMax: filters.priceMax,
      yearMin: filters.yearMin,
      yearMax: filters.yearMax,
      kmMax: filters.kmMax,
      sort,
    },
  };
}

/** Somente anúncios publicados aparecem no site. */
export const PUBLIC_VEHICLE_STATUSES = ["available", "reserved"] as const;
