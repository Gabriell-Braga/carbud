import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { vehicles, type VehicleStatus } from "@/db/schema";
import { withBasePath } from "@/lib/paths";
import { getOrigin } from "@/lib/seo/urls";
import { tenantPublicPath } from "@/lib/tenant/resolveTenant";
import { getTenantCoreBySlug, isPublicSiteAvailable } from "@/lib/tenant/service";
import { getTemplate } from "@carbud/site-kit/registry";

export const dynamic = "force-dynamic";

const PUBLIC_STATUSES: VehicleStatus[] = ["available", "reserved"];
const MAX_URLS = 2000;

/** Sitemap por revenda (a tenancy é por path, então cada slug tem o seu). */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const tenant = await getTenantCoreBySlug(slug);
  if (!tenant || !isPublicSiteAvailable(tenant)) {
    return new Response("Não encontrado", { status: 404 });
  }

  const db = await getDb();
  const rows = await db
    .select({ slug: vehicles.slug, updatedAt: vehicles.updatedAt })
    .from(vehicles)
    .where(and(eq(vehicles.tenantId, tenant.id), inArray(vehicles.status, PUBLIC_STATUSES)))
    .orderBy(desc(vehicles.updatedAt))
    .limit(MAX_URLS);

  const origin = await getOrigin();
  const now = new Date().toISOString();

  /*
   * As páginas institucionais só entram quando o template escolhido as
   * implementa — anunciar no sitemap uma URL que responde 404 é o jeito mais
   * rápido de perder confiança do buscador.
   *
   * Privacidade e termos ficam de fora de propósito: são `noindex`, existem
   * para quem procura por elas, e não disputam busca.
   */
  const template = getTemplate(tenant.templateId);
  const opcionais = [
    template.Financing ? { path: "/financiamento", priority: "0.6" } : null,
    template.SellCar ? { path: "/venda-seu-carro", priority: "0.6" } : null,
    template.About ? { path: "/sobre", priority: "0.4" } : null,
  ].filter((item) => item !== null);

  const entries = [
    { loc: tenantPublicPath(slug), lastmod: now, priority: "1.0", changefreq: "daily" },
    { loc: tenantPublicPath(slug, "/estoque"), lastmod: now, priority: "0.9", changefreq: "daily" },
    { loc: tenantPublicPath(slug, "/contato"), lastmod: now, priority: "0.5", changefreq: "monthly" },
    ...opcionais.map((item) => ({
      loc: tenantPublicPath(slug, item.path),
      lastmod: now,
      priority: item.priority,
      changefreq: "monthly",
    })),
    ...rows.map((row) => ({
      loc: tenantPublicPath(slug, `/veiculo/${row.slug}`),
      lastmod: row.updatedAt.toISOString(),
      priority: "0.8",
      changefreq: "weekly",
    })),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries
  .map(
    (entry) => `  <url>
    <loc>${escapeXml(`${origin}${withBasePath(entry.loc)}`)}</loc>
    <lastmod>${entry.lastmod}</lastmod>
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority}</priority>
  </url>`,
  )
  .join("\n")}
</urlset>`;

  return new Response(xml, {
    headers: { "content-type": "application/xml; charset=utf-8" },
  });
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
