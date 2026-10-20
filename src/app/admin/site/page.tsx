import type { Metadata } from "next";
import { DEFAULT_WHATSAPP_FORM_FIELDS } from "@carbud/site-kit/catalog";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { PageHeader } from "@/components/layout/shell";
import { Button } from "@/components/ui/button";
import { getDb } from "@/db";
import { tenantBanners, tenantSites } from "@/db/schema";
import { requireTenantPage } from "@/lib/auth/guards";
import { can } from "@/lib/auth/rbac";
import { tenantPublicPath } from "@/lib/tenant/resolveTenant";
import { Tabs } from "@/components/ui/tabs";
import { DEFAULT_THEME } from "@carbud/site-kit/contract";
import { listDomains } from "@/lib/services/domains";
import { hostingReady } from "@/lib/integrations/vercel";
import { isVaultConfigured } from "@/lib/security/vault";
import { getTemplate } from "@carbud/site-kit/registry";
import { ContactPanel } from "./contact-panel";
import { ContentPanel } from "./content-panel";
import { IdentityPanel } from "./identity-panel";
import { DomainsPanel } from "./domains-panel";
import { PagesPanel } from "./pages-panel";
import { TrackingPanel } from "./tracking-panel";
import { GtmCard } from "./gtm-card";

export const metadata: Metadata = { title: "Site" };
export const dynamic = "force-dynamic";

const TABS = [
  { key: "identidade", label: "Identidade" },
  { key: "contato", label: "Contato" },
  { key: "conteudo", label: "Conteúdo" },
  { key: "paginas", label: "Páginas" },
  { key: "dominio", label: "Domínio" },
  { key: "rastreamento", label: "Rastreamento" },
] as const;

export default async function SitePage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string }>;
}) {
  const context = await requireTenantPage("site:read");
  const { aba } = await searchParams;
  const tab = TABS.some((item) => item.key === aba) ? aba! : "identidade";

  const db = await getDb();
  const siteRows = await db
    .select()
    .from(tenantSites)
    .where(eq(tenantSites.tenantId, context.tenant.id))
    .limit(1);
  const site = siteRows[0];

  const banners =
    tab === "conteudo"
      ? await db
          .select()
          .from(tenantBanners)
          .where(eq(tenantBanners.tenantId, context.tenant.id))
          .orderBy(asc(tenantBanners.position))
      : [];

  const domains = tab === "dominio" ? await listDomains(context.tenant.id) : [];

  const template = getTemplate(context.tenant.templateId);

  const readOnly = !can(context.role, "site:write") || context.access !== "full";

  return (
    <>
      <PageHeader
        title="Site"
        description="Configure a identidade, os dados de contato e os textos do seu site."
        actions={
          <Link href={tenantPublicPath(context.tenant.slug)} target="_blank">
            <Button variant="secondary">Ver meu site</Button>
          </Link>
        }
      />

      <Tabs
        active={tab}
        items={TABS.map((item) => ({
          key: item.key,
          label: item.label,
          href: `/admin/site?aba=${item.key}`,
        }))}
      />

      {tab === "identidade" ? (
        <IdentityPanel
          readOnly={readOnly}
          slug={context.tenant.slug}
          initial={{
            templateId: context.tenant.templateId,
            logoKey: site?.logoKey ?? null,
            faviconKey: site?.faviconKey ?? null,
            theme: {
              primary: site?.theme?.primary ?? DEFAULT_THEME.primary,
              primaryForeground:
                site?.theme?.primaryForeground ?? DEFAULT_THEME.primaryForeground,
              accent: site?.theme?.accent ?? DEFAULT_THEME.accent,
              surface: site?.theme?.surface ?? DEFAULT_THEME.surface,
              fontHeading: site?.theme?.fontHeading ?? DEFAULT_THEME.fontHeading,
              fontBody: site?.theme?.fontBody ?? DEFAULT_THEME.fontBody,
            },
          }}
        />
      ) : null}

      {tab === "contato" ? (
        <ContactPanel
          readOnly={readOnly}
          initial={{
            phone: site?.phone ?? "",
            whatsapp: site?.whatsapp ?? "",
            whatsappForm: site?.whatsappForm ?? false,
            whatsappFormFields: site?.whatsappFormFields ?? DEFAULT_WHATSAPP_FORM_FIELDS,
            email: site?.email ?? "",
            addressStreet: site?.addressStreet ?? "",
            addressNumber: site?.addressNumber ?? "",
            addressComplement: site?.addressComplement ?? "",
            addressDistrict: site?.addressDistrict ?? "",
            addressCity: site?.addressCity ?? "",
            addressState: site?.addressState ?? "",
            addressZip: site?.addressZip ?? "",
            mapsUrl: site?.mapsUrl ?? "",
            businessHours: site?.businessHours ?? [],
            social: site?.social ?? {},
          }}
        />
      ) : null}

      {tab === "paginas" ? (
        <PagesPanel
          readOnly={readOnly}
          hasFinancing={Boolean(template.Financing)}
          initial={{
            stats: site?.stats ?? [],
            reviews: (site?.reviews ?? []).map((review) => ({
              rating: review.rating,
              text: review.text,
              author: review.author ?? "",
            })),
            downPaymentPercent: site?.financing?.downPaymentPercent ?? 20,
            terms: site?.financing?.terms ?? [24, 36, 48, 60],
            legalPrivacy: site?.legalPrivacy ?? "",
            legalTerms: site?.legalTerms ?? "",
          }}
        />
      ) : null}

      {tab === "dominio" ? (
        <DomainsPanel
          readOnly={readOnly}
          hostingReady={hostingReady()}
          domains={domains.map((row) => ({
            id: row.id,
            domain: row.domain,
            status: row.status,
            isPrimary: row.isPrimary,
            pendingRecords: row.pendingRecords,
            lastError: row.lastError,
            lastCheckedAt: row.lastCheckedAt ? row.lastCheckedAt.toISOString() : null,
          }))}
        />
      ) : null}

      {tab === "rastreamento" ? <GtmCard readOnly={readOnly} initial={site?.gtmCode ?? ""} /> : null}

      {tab === "rastreamento" ? (
        <TrackingPanel
          readOnly={readOnly}
          vaultReady={isVaultConfigured()}
          initial={{
            metaPixelId: site?.tracking?.metaPixelId ?? "",
            ga4MeasurementId: site?.tracking?.ga4MeasurementId ?? "",
            googleAdsId: site?.tracking?.googleAdsId ?? "",
            googleAdsLeadLabel: site?.tracking?.googleAdsLeadLabel ?? "",
            googleAdsSaleLabel: site?.tracking?.googleAdsSaleLabel ?? "",
            serverSide: site?.tracking?.serverSide ?? false,
          }}
          /*
           * Só a existência do segredo chega à tela — o valor fica no cofre.
           * Ler o blob para dizer QUAL deles existe custaria uma abertura do
           * cofre a cada carregamento da página; o marcador de que há algo
           * guardado basta para a tela decidir o que escrever no campo.
           */
          secrets={{
            metaAccessToken: Boolean(site?.trackingSecrets),
            ga4ApiSecret: Boolean(site?.trackingSecrets),
          }}
        />
      ) : null}

      {tab === "conteudo" ? (
        <ContentPanel
          readOnly={readOnly}
          initial={{
            aboutTitle: site?.aboutTitle ?? "",
            aboutText: site?.aboutText ?? "",
          }}
          banners={banners.map((banner) => ({
            id: banner.id,
            imageKey: banner.imageKey,
            title: banner.title,
            subtitle: banner.subtitle,
            ctaLabel: banner.ctaLabel,
            ctaHref: banner.ctaHref,
            active: banner.active,
          }))}
        />
      ) : null}
    </>
  );
}
