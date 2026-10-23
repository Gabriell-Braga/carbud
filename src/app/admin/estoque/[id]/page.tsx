import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, FileText } from "lucide-react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/shell";
import { Button } from "@/components/ui/button";
import { VehicleStatusBadge } from "@/components/admin/status-badges";
import { Badge } from "@/components/ui/badge";
import { VehicleForm } from "@/components/admin/vehicle-form";
import { requireTenantPage } from "@/lib/auth/guards";
import { can } from "@/lib/auth/rbac";
import { getVehicle, isInspected, listMedia360 } from "@/lib/services/vehicles";
import { mediaUrl } from "@/lib/paths";
import { publicSiteUrl } from "@/lib/services/domains";
import { listStores } from "@/lib/services/stores";
import { tenantHasFeature } from "@/lib/api/feature-guard";
import { tenantPublicPath } from "@/lib/tenant/resolveTenant";
import { DeleteVehicleButton } from "./delete-button";
import { InspectionCard, Media360Card } from "./inspection-360";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const context = await requireTenantPage("vehicles:read");
  const { id } = await params;
  const found = await getVehicle(context.tenant.id, id);
  return {
    title: found ? `${found.vehicle.brand} ${found.vehicle.model}` : "Veículo",
  };
}

export default async function EditVehiclePage({ params }: Props) {
  const context = await requireTenantPage("vehicles:read");
  const { id } = await params;

  const found = await getVehicle(context.tenant.id, id);
  if (!found) notFound();

  const { vehicle, photos } = found;
  const canWrite = can(context.role, "vehicles:write") && context.access === "full";
  const [media360Map, siteUrl, multiStore] = await Promise.all([
    listMedia360([vehicle.id]),
    publicSiteUrl(context.tenant.id),
    tenantHasFeature(context.tenant.id, "gestao_multiunidade"),
  ]);
  const stores = multiStore ? await listStores(context.tenant.id, true) : [];
  const media360 = media360Map.get(vehicle.id) ?? { spin: [], pano: null };
  // a prévia interna só quando a revenda ainda não tem domínio no ar
  const vehiclePath = `/veiculo/${vehicle.slug}`;
  const siteVehicleUrl = siteUrl
    ? `${siteUrl}${vehiclePath}`
    : tenantPublicPath(context.tenant.slug, vehiclePath);

  return (
    <>
      <PageHeader
        title={`${vehicle.brand} ${vehicle.model}`}
        description={vehicle.version ?? undefined}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={`/admin/estoque/${vehicle.id}/venda`}>
              <Button variant="secondary">
                <FileText className="h-3.5 w-3.5" />
                Contrato de venda
              </Button>
            </Link>
            {vehicle.status !== "draft" ? (
              <Link
                href={siteVehicleUrl}
                target="_blank"
              >
                <Button variant="secondary">
                  Ver no site
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
              </Link>
            ) : null}
          </div>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <VehicleStatusBadge status={vehicle.status} />
        {vehicle.featured ? <Badge tone="info">Destaque na home</Badge> : null}
      </div>

      <div className="flex flex-col gap-4">
        <VehicleForm
          readOnly={!canWrite}
          stores={stores.map((store) => ({ id: store.id, name: store.name }))}
          photos={photos.map((photo) => ({
            id: photo.id,
            variants: photo.variants,
            isCover: photo.isCover,
            position: photo.position,
          }))}
          initial={{
            id: vehicle.id,
            brand: vehicle.brand,
            model: vehicle.model,
            version: vehicle.version ?? "",
            yearManufacture: vehicle.yearManufacture,
            yearModel: vehicle.yearModel,
            mileageKm: vehicle.mileageKm,
            priceCents: vehicle.priceCents,
            priceOnRequest: vehicle.priceOnRequest,
            transmission: vehicle.transmission ?? "",
            fuel: vehicle.fuel ?? "",
            bodyType: vehicle.bodyType ?? "",
            color: vehicle.color ?? "",
            doors: vehicle.doors ? String(vehicle.doors) : "",
            licensePlate: vehicle.licensePlate ?? "",
            options: vehicle.options ?? [],
            description: vehicle.description ?? "",
            status: vehicle.status,
            featured: vehicle.featured,
            storeId: vehicle.storeId ?? "",
            fipeCode: vehicle.fipeCode,
            fipePriceCents: vehicle.fipePriceCents,
            fipeReference: vehicle.fipeReference,
          }}
        />

        <InspectionCard
          vehicleId={vehicle.id}
          readOnly={!canWrite}
          initial={
            vehicle.inspectionReportKey && vehicle.inspectionResult && vehicle.inspectionDate
              ? {
                  provider: vehicle.inspectionProvider ?? "",
                  date: vehicle.inspectionDate,
                  result: vehicle.inspectionResult,
                  reportUrl: mediaUrl(vehicle.inspectionReportKey) ?? "",
                  valid: isInspected(vehicle),
                }
              : null
          }
        />

        <Media360Card
          vehicleId={vehicle.id}
          readOnly={!canWrite}
          initial={{
            spin: media360.spin.map((key) => mediaUrl(key) ?? ""),
            pano: mediaUrl(media360.pano),
          }}
        />

        {canWrite ? (
          <DeleteVehicleButton
            vehicleId={vehicle.id}
            label={`${vehicle.brand} ${vehicle.model}`}
          />
        ) : null}
      </div>
    </>
  );
}
