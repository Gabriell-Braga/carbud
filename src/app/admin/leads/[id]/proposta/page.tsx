import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { tenants, users } from "@/db/schema";
import { PageHeader } from "@/components/layout/shell";
import { requireTenantPage } from "@/lib/auth/guards";
import { getLead } from "@/lib/services/leads";
import { getSiteData } from "@/lib/services/site";
import { getVehicle } from "@/lib/services/vehicles";
import { ProposalDocument } from "./proposal-document";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Proposta" };

type Props = { params: Promise<{ id: string }> };

export default async function ProposalPage({ params }: Props) {
  const context = await requireTenantPage("leads:read");
  const { id } = await params;

  const lead = await getLead(context.tenant.id, id);
  if (!lead) notFound();

  const db = await getDb();
  const [site, company, found, seller] = await Promise.all([
    getSiteData(context.tenant.slug),
    db
      .select({ legalName: tenants.legalName, cnpj: tenants.cnpj })
      .from(tenants)
      .where(eq(tenants.id, context.tenant.id))
      .limit(1),
    lead.vehicleId ? getVehicle(context.tenant.id, lead.vehicleId) : null,
    lead.assignedToUserId
      ? db
          .select({ name: users.name })
          .from(users)
          .where(and(eq(users.id, lead.assignedToUserId), eq(users.tenantId, context.tenant.id)))
          .limit(1)
      : [],
  ]);

  const negotiation = lead.negotiation ?? {};
  const vehicle = found?.vehicle;

  return (
    <>
      <PageHeader title="Proposta comercial" description={lead.name} />
      <ProposalDocument
        store={{
          name: site?.name ?? context.tenant.name,
          legalName: company[0]?.legalName ?? null,
          cnpj: company[0]?.cnpj ?? null,
          logoUrl: site?.logoUrl ?? null,
          address: site?.contact.address.full ?? null,
          phone: site?.contact.phone ?? site?.contact.whatsapp ?? null,
          email: site?.contact.email ?? null,
        }}
        customer={{ name: lead.name, phone: lead.phone, email: lead.email }}
        // carro do estoque vence a ficha: é o que está à venda de fato
        vehicle={
          vehicle
            ? {
                description: [vehicle.brand, vehicle.model, vehicle.version].filter(Boolean).join(" "),
                years: `${vehicle.yearManufacture}/${vehicle.yearModel}`,
                mileageKm: vehicle.mileageKm,
                priceCents: vehicle.priceCents,
              }
            : {
                description:
                  [negotiation.brand, negotiation.model, negotiation.version].filter(Boolean).join(" ") ||
                  lead.vehicleLabel ||
                  "",
                years: "",
                mileageKm: null,
                priceCents: null,
              }
        }
        negotiation={negotiation}
        sellerName={seller[0]?.name ?? context.user.name}
      />
    </>
  );
}
