import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { leads, tenants } from "@/db/schema";
import { PageHeader } from "@/components/layout/shell";
import { allows, requireTenantPage } from "@/lib/auth/guards";
import { can } from "@/lib/auth/rbac";
import { getVehicleFinance } from "@/lib/services/vehicle-finance";
import { FUEL_LABELS, TRANSMISSION_LABELS } from "@/lib/catalog/labels";
import { formatPlate } from "@/lib/format/plate";
import { getSiteData } from "@/lib/services/site";
import { getVehicle } from "@/lib/services/vehicles";
import { SaleDocument } from "./sale-document";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Vender veículo" };

type Props = { params: Promise<{ id: string }> };

export default async function SaleDocumentPage({ params }: Props) {
  const context = await requireTenantPage("vehicles:read");
  const { id } = await params;

  const found = await getVehicle(context.tenant.id, id);
  if (!found) notFound();
  const { vehicle } = found;

  const db = await getDb();
  const [site, company, vehicleLeads] = await Promise.all([
    getSiteData(context.tenant.slug),
    db
      .select({ legalName: tenants.legalName, cnpj: tenants.cnpj })
      .from(tenants)
      .where(eq(tenants.id, context.tenant.id))
      .limit(1),
    db
      .select({ name: leads.name, phone: leads.phone, email: leads.email, status: leads.status })
      .from(leads)
      .where(and(eq(leads.tenantId, context.tenant.id), eq(leads.vehicleId, vehicle.id)))
      .orderBy(desc(leads.createdAt))
      .limit(20),
  ]);

  // o comprador provável é quem foi marcado como ganho neste carro; sem ele, o
  // contato mais recente — o vendedor confere e corrige no formulário
  const buyer = vehicleLeads.find((lead) => lead.status === "won") ?? vehicleLeads[0] ?? null;
  // a venda lançada no financeiro do carro vence o palpite pelos leads
  const [financeRead, financeWrite] = await Promise.all([
    allows(context, context.tenant.id, "finance:read"),
    allows(context, context.tenant.id, "finance:write"),
  ]);
  const sale = financeRead ? (await getVehicleFinance(context.tenant.id, vehicle.id)).finance : null;
  const full = context.access === "full";
  const sold = vehicle.status === "sold";

  return (
    <>
      <PageHeader
        title={sold ? "Contrato de venda" : "Vender veículo"}
        description={`${vehicle.brand} ${vehicle.model} ${vehicle.version ?? ""}`.trim()}
      />
      <SaleDocument
        seller={{
          name: site?.name ?? context.tenant.name,
          legalName: company[0]?.legalName ?? null,
          cnpj: company[0]?.cnpj ?? null,
          logoUrl: site?.logoUrl ?? null,
          address: site?.contact.address.full ?? null,
          city: site?.contact.address.city ?? null,
          state: site?.contact.address.state ?? null,
          phone: site?.contact.phone ?? site?.contact.whatsapp ?? null,
          email: site?.contact.email ?? null,
        }}
        sold={sold}
        canWriteVehicle={full && can(context.role, "vehicles:write")}
        canWriteFinance={full && financeWrite}
        saleDate={sale?.saleDate ?? null}
        savedContract={sale?.contract ?? null}
        vehicle={{
          id: vehicle.id,
          brand: vehicle.brand,
          model: [vehicle.model, vehicle.version].filter(Boolean).join(" "),
          years: `${vehicle.yearManufacture}/${vehicle.yearModel}`,
          plate: vehicle.licensePlate ? formatPlate(vehicle.licensePlate) : "",
          color: vehicle.color ?? "",
          fuel: vehicle.fuel ? FUEL_LABELS[vehicle.fuel] : "",
          transmission: vehicle.transmission ? TRANSMISSION_LABELS[vehicle.transmission] : "",
          mileageKm: vehicle.mileageKm,
          priceCents: sale?.salePriceCents ?? vehicle.priceCents,
        }}
        buyer={{
          name: sale?.buyerName ?? buyer?.name ?? "",
          phone: sale?.buyerPhone ?? buyer?.phone ?? "",
          email: buyer?.email ?? "",
          cpf: sale?.buyerDocument ?? "",
        }}
      />
    </>
  );
}
