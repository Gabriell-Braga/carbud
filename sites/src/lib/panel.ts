import { notFound } from "next/navigation";
import type { TrackingIds } from "@carbud/site-kit/shared/tracking";
import { siteWithLocalMedia, vehicleWithLocalMedia } from "./media";
import { panelUrl } from "./panel-url";
import type {
  AppliedFilters,
  SiteData,
  StockFacets,
  VehicleView,
} from "@carbud/site-kit/contract";

/**
 * Cliente da API publica do painel.
 *
 * Este app nao tem banco: o D1 e um binding do Cloudflare, e aqui e a Vercel.
 * Tudo que ele desenha vem destas rotas, e nada alem delas — se algum dia
 * aparecer um `import` de Drizzle nesta pasta, o desenho saiu do lugar.
 */

/**
 * Chave compartilhada, quando o painel exige uma.
 *
 * O conteudo e publico de qualquer forma; a chave existe para que ninguem
 * varra o catalogo de todas as revendas em rajada as custas da cota de leitura
 * do banco. Quando o painel nao define a dele, esta fica vazia e nada muda.
 */
const SITES_API_KEY = process.env.SITES_API_KEY ?? "";

type Envelope<T> = { ok: true; data: T } | { ok: false; error: string };

async function get<T>(path: string, revalidate: number): Promise<T | null> {
  const response = await fetch(`${panelUrl()}${path}`, {
    headers: SITES_API_KEY ? { "x-sites-key": SITES_API_KEY } : {},
    next: { revalidate },
  });

  /*
   * HTML no lugar de JSON quer dizer que PANEL_URL aponta para o lugar errado.
   *
   * Foi o que aconteceu na primeira publicacao: o painel vive sob um mount
   * path (`/app`), e sem ele a chamada caia no 404 em HTML do site Webflow. O
   * app leu aquilo como "revenda nao existe" e devolveu 404 — a mesma resposta
   * de um dominio nao cadastrado, que e um problema COMPLETAMENTE diferente e
   * mandou a investigacao para o lado errado.
   *
   * A checagem vem antes da do 404 justamente porque o sintoma era um 404.
   */
  const tipo = response.headers.get("content-type") ?? "";
  if (!tipo.includes("json")) {
    throw new Error(
      `PANEL_URL parece errada: ${panelUrl()}${path} respondeu ${response.status} ` +
        `em "${tipo || "tipo desconhecido"}", e não JSON. ` +
        "Confira se falta o caminho onde o painel está montado (ex.: /app).",
    );
  }

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Painel respondeu ${response.status} em ${path}`);
  }

  const payload = (await response.json()) as Envelope<T>;
  if (!payload.ok) throw new Error(payload.error);
  return payload.data;
}

/**
 * Dominio -> revenda.
 *
 * Cacheado por cinco minutos: o vinculo quase nunca muda, e sem cache cada
 * visita gastaria uma ida ao banco so para descobrir de quem e o site. Um
 * dominio recem-cadastrado leva ate esse tempo para responder — e o proprio
 * DNS demora mais que isso.
 */
export async function slugForHost(host: string): Promise<string | null> {
  const data = await get<{ slug: string }>(
    `/api/public/resolve?host=${encodeURIComponent(host)}`,
    300,
  );
  return data?.slug ?? null;
}

export type SitePayload = {
  site: SiteData;
  templateId: string;
  gtmCode: string | null;
  /** Ids publicos de pixel/medicao; os segredos ficam no painel. */
  tracking: TrackingIds | null;
  available: boolean;
  /** `https://dominio-oficial`, ou null enquanto nenhum domínio está no ar. */
  canonicalOrigin: string | null;
};

export async function fetchSite(slug: string): Promise<SitePayload> {
  const data = await get<SitePayload>(`/api/public/site/${slug}`, 60);
  if (!data) notFound();
  return { ...data, site: siteWithLocalMedia(data.site) };
}

export type HomePayload = {
  featured: VehicleView[];
  latest: VehicleView[];
  facets: StockFacets;
  totalVehicles: number;
};

export async function fetchHome(slug: string): Promise<HomePayload> {
  const data = await get<HomePayload>(`/api/public/site/${slug}/home`, 60);
  if (!data) notFound();
  return {
    ...data,
    featured: data.featured.map(vehicleWithLocalMedia),
    latest: data.latest.map(vehicleWithLocalMedia),
  };
}

export type VehiclesPayload = {
  vehicles: VehicleView[];
  facets: StockFacets;
  filters: AppliedFilters;
  total: number;
  page: number;
  pageSize: number;
};

export async function fetchVehicles(
  slug: string,
  query: Record<string, string | string[] | undefined> = {},
): Promise<VehiclesPayload> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first) search.set(key, first);
  }
  const suffix = search.toString();
  const data = await get<VehiclesPayload>(
    `/api/public/site/${slug}/vehicles${suffix ? `?${suffix}` : ""}`,
    60,
  );
  if (!data) notFound();
  return { ...data, vehicles: data.vehicles.map(vehicleWithLocalMedia) };
}

export type VehiclePayload = { vehicle: VehicleView; related: VehicleView[] };

export async function fetchVehicle(
  slug: string,
  vehicleSlug: string,
): Promise<VehiclePayload> {
  const data = await get<VehiclePayload>(
    `/api/public/site/${slug}/vehicles/${vehicleSlug}`,
    60,
  );
  if (!data) notFound();
  return {
    vehicle: vehicleWithLocalMedia(data.vehicle),
    related: data.related.map(vehicleWithLocalMedia),
  };
}

export type SitemapPayload = {
  available: boolean;
  pages: { financing: boolean; sellCar: boolean; about: boolean };
  vehicles: { slug: string; updatedAt: string }[];
};

export async function fetchSitemap(slug: string): Promise<SitemapPayload | null> {
  return await get<SitemapPayload>(`/api/public/site/${slug}/sitemap`, 300);
}

export type FinancingOption = { id: string; label: string; priceCents: number };

export async function fetchFinancingOptions(
  slug: string,
  preselectedId?: string,
): Promise<FinancingOption[]> {
  const suffix = preselectedId ? `?veiculo=${encodeURIComponent(preselectedId)}` : "";
  const data = await get<{ options: FinancingOption[] }>(
    `/api/public/site/${slug}/financing-options${suffix}`,
    60,
  );
  return data?.options ?? [];
}
