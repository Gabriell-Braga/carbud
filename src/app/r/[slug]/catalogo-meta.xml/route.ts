import { buildMetaCatalogXml } from "@/lib/integrations/meta-catalog";
import { publicSiteUrl } from "@/lib/services/domains";
import { getOrigin, tenantAbsoluteUrl } from "@/lib/seo/urls";
import { loadFeedData } from "@/lib/services/stock-feed-data";
import { getTenantCoreBySlug, isPublicSiteAvailable } from "@/lib/tenant/service";

export const dynamic = "force-dynamic";

/**
 * Catálogo de veículos da Meta, importado por feed agendado.
 *
 * Público e com a mesma regra de suspensão do feed dos portais. O `url` de
 * cada anúncio aponta para o domínio próprio quando existe: a Meta pede que o
 * clique caia no site do anunciante, e o pixel que mede a conversão está lá.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const tenant = await getTenantCoreBySlug(slug);
  if (!tenant || !isPublicSiteAvailable(tenant)) {
    return new Response("Não encontrado", { status: 404 });
  }

  const [origin, ownSite, previewUrl] = await Promise.all([
    getOrigin(),
    publicSiteUrl(tenant.id),
    tenantAbsoluteUrl(slug),
  ]);
  const siteOrigin = ownSite ?? previewUrl;
  const { store, vehicles, meta } = await loadFeedData(tenant.id, tenant.name, slug, origin);

  const xml = buildMetaCatalogXml(store, vehicles, {
    siteOrigin,
    pageId: meta.pageId,
    privacyUrl: meta.hasPrivacy ? `${siteOrigin}/privacidade` : null,
  });

  return new Response(xml, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=600, s-maxage=600",
    },
  });
}
