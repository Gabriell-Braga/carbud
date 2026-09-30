import { withBasePath } from "@/lib/paths";
import { getOrigin } from "@/lib/seo/urls";
import { tenantPublicPath } from "@/lib/tenant/resolveTenant";
import { getTenantCoreBySlug, isPublicSiteAvailable } from "@/lib/tenant/service";

export const dynamic = "force-dynamic";

/**
 * robots por revenda. Revenda fora do ar pede desindexação para o site
 * não ficar aparecendo no Google enquanto estiver indisponível.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tenant = await getTenantCoreBySlug(slug);
  const origin = await getOrigin();

  if (!tenant || !isPublicSiteAvailable(tenant)) {
    return new Response("User-agent: *\nDisallow: /\n", {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const body = [
    "User-agent: *",
    `Allow: ${withBasePath(tenantPublicPath(slug))}`,
    "Disallow: /admin",
    "Disallow: /super-admin",
    "Disallow: /api",
    "",
    `Sitemap: ${origin}${withBasePath(tenantPublicPath(slug, "/sitemap.xml"))}`,
    "",
  ].join("\n");

  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
