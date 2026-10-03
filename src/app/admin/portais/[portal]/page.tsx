import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/shell";
import { requireTenantPage } from "@/lib/auth/guards";
import { can } from "@/lib/auth/rbac";
import { tenantHasFeature } from "@/lib/api/feature-guard";
import { getPortal } from "@/lib/integrations/portals";
import { portalAdTypes } from "@/lib/services/portal-ad-types";
import { getConnection, portalListings } from "@/lib/services/portals";
import { ListingsPanel } from "./listings-panel";
import { SyncButton } from "../sync-button";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ portal: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { portal } = await params;
  return { title: `Anúncios · ${getPortal(portal)?.name ?? "Portal"}` };
}

/**
 * Os anúncios de um portal, carro a carro.
 *
 * O card em /admin/portais diz quantos; aqui está o quê e por quê. É a
 * tela de trabalho: quem vê "18 com erro" vem aqui, lê o motivo ao lado de
 * cada carro, corrige e sincroniza de novo sem sair.
 */
export default async function PortalListingsPage({ params }: Params) {
  const { portal: key } = await params;
  const portal = getPortal(key);
  if (!portal || portal.method === "feed") notFound();

  const context = await requireTenantPage("vehicles:read");
  if (!(await tenantHasFeature(context.tenant.id, "integracao_classificados"))) {
    redirect("/admin/portais");
  }

  const connection = await getConnection(context.tenant.id, key);
  const connected = connection?.status === "conectado";

  const [listings, adTypes] = await Promise.all([
    portalListings(context.tenant.id, key),
    connected ? portalAdTypes(context.tenant.id, key) : null,
  ]);

  const canWrite = can(context.role, "tenant:settings");

  return (
    <>
      <PageHeader
        eyebrow="Portais"
        title={portal.name}
        description={
          connected
            ? "Cada carro do estoque e como ele está no portal. Corrija a ficha e sincronize de novo."
            : "Este portal não está conectado. Conecte em Portais para publicar o estoque."
        }
        actions={
          connected && canWrite ? (
            <SyncButton portalKey={key} portalName={portal.name} size="md" />
          ) : null
        }
      />
      <ListingsPanel
        portalKey={key}
        portalName={portal.name}
        connected={connected}
        canWrite={canWrite}
        connectionError={connection?.lastError ?? null}
        lastSyncAt={connection?.lastSyncAt?.toISOString() ?? null}
        adTypes={adTypes}
        listings={listings.map((listing) => ({
          id: listing.id,
          vehicleId: listing.vehicleId,
          vehicle: `${listing.brand} ${listing.model}`,
          version: listing.version,
          yearModel: listing.yearModel,
          vehicleStatus: listing.vehicleStatus,
          status: listing.status,
          detail: listing.detail,
          url: listing.url,
          syncedAt: listing.syncedAt?.toISOString() ?? null,
          listingType: listing.meta?.listingType ?? null,
          appliedListingType: listing.meta?.appliedListingType ?? null,
          highlightedAt: listing.meta?.highlightedAt ?? null,
          nextHighlights: listing.meta?.nextHighlights ?? [],
          canHighlight: Boolean(listing.meta?.listId) && listing.status === "publicado",
        }))}
      />
    </>
  );
}
