import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/shell";
import { FeatureLocked } from "@/components/admin/feature-locked";
import { requireTenantPage } from "@/lib/auth/guards";
import { can } from "@/lib/auth/rbac";
import { tenantHasFeature } from "@/lib/api/feature-guard";
import { portalCards } from "@/lib/integrations/portal-apps";
import { leadInboxToken } from "@/lib/integrations/portal-lead-inbox";
import { withBasePath } from "@/lib/paths";
import { getOrigin } from "@/lib/seo/urls";
import { isVaultConfigured } from "@/lib/security/vault";
import {
  connectionPublishes,
  listConnections,
  publicationSummary,
} from "@/lib/services/portals";
import { PortalsPanel } from "./portals-panel";

export const metadata: Metadata = { title: "Portais" };
export const dynamic = "force-dynamic";

export default async function PortalsPage({
  searchParams,
}: {
  searchParams: Promise<{ portal?: string; conectado?: string; erro?: string }>;
}) {
  const { portal, conectado, erro } = await searchParams;
  const context = await requireTenantPage("vehicles:read");

  if (!(await tenantHasFeature(context.tenant.id, "integracao_classificados"))) {
    return (
      <>
        <PageHeader title="Portais" description="Publique seu estoque nos classificados." />
        <FeatureLocked
          title="Integração com classificados não está no plano desta revenda"
          description="Ela liga o estoque aos classificados nos dois sentidos: o carro cadastrado sobe sozinho, o vendido sai sozinho, e quem pergunta no anúncio entra no CRM como lead."
        />
      </>
    );
  }

  const [connections, summary, origin] = await Promise.all([
    listConnections(context.tenant.id),
    publicationSummary(context.tenant.id),
    getOrigin(),
  ]);

  /*
   * O endereço que a loja cadastra em cada portal como "URL de leads".
   * Um por portal, derivado do segredo do app — não há nada guardado, e por
   * isso ele pode ser mostrado de novo a qualquer momento.
   */
  const cards = portalCards();
  const leadInboxes = Object.fromEntries(
    await Promise.all(
      cards.map(async (portal) => [
        portal.key,
        `${origin}${withBasePath(`/api/portals/${portal.key}/leads`)}?token=${await leadInboxToken(
          context.tenant.id,
          portal.key,
        )}`,
      ]),
    ),
  ) as Record<string, string>;

  return (
    <>
      <PageHeader
        title="Portais"
        description="Conecte a conta da loja uma vez. Depois o estoque sobe e sai daqui, e quem pergunta no anúncio chega como lead."
      />
      <PortalsPanel
        portals={cards}
        leadInboxes={leadInboxes}
        notice={portal && (conectado || erro) ? { portal, error: erro ?? null } : null}
        vaultReady={isVaultConfigured()}
        canWrite={can(context.role, "tenant:settings")}
        tenantSlug={context.tenant.slug}
        origin={origin}
        connections={connections.map((connection) => ({
          portal: connection.portal,
          status: connection.status,
          hasCredentials: Boolean(connection.credentials),
          lastSyncAt: connection.lastSyncAt?.toISOString() ?? null,
          lastError: connection.lastError,
          publishes: connectionPublishes(connection),
          // OLX: a URL de leads foi cadastrada pela API (ou o motivo de não ter sido)
          leadsConfigured: Boolean(connection.settings?.leadConfigId),
          leadsError: (connection.settings?.leadConfigError as string | undefined) ?? null,
        }))}
        summary={summary}
      />
    </>
  );
}
