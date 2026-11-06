import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/shell";
import { FeatureLocked } from "@/components/admin/feature-locked";
import { Alert } from "@/components/ui/alert";
import { requireTenantPage } from "@/lib/auth/guards";
import { tenantHasFeature } from "@/lib/api/feature-guard";
import { listCampaigns } from "@/lib/services/campaigns";
import { listTeams } from "@/lib/services/teams";
import { listVehicleOptions } from "@/lib/services/vehicles";
import { getWhatsappConnection } from "@/lib/services/whatsapp";
import { CampaignsPanel } from "./campaigns-panel";

export const metadata: Metadata = { title: "Campanhas" };
export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const context = await requireTenantPage("campaigns:write");

  if (!(await tenantHasFeature(context.tenant.id, "whatsapp_integrado"))) {
    return (
      <>
        <PageHeader title="Campanhas" description="Mensagem para uma lista tirada do CRM." />
        <FeatureLocked
          title="WhatsApp integrado não está no plano desta revenda"
          description="Campanhas usam a API oficial do WhatsApp para falar com quem já foi lead: avisar que chegou o carro que a pessoa queria, reativar quem sumiu."
        />
      </>
    );
  }

  const [connection, campaigns, teams, vehicles] = await Promise.all([
    getWhatsappConnection(context.tenant.id),
    listCampaigns(context.tenant.id),
    listTeams(context.tenant.id),
    listVehicleOptions(context.tenant.id),
  ]);

  return (
    <>
      <PageHeader
        title="Campanhas"
        description="Mensagem de WhatsApp para quem já foi lead: chegou o carro que a pessoa queria, promoção, reativação."
      />
      {!connection ? (
        <Alert tone="warning">
          Conecte o WhatsApp da loja em{" "}
          <Link href="/admin/mensagens?aba=conexao" className="font-medium underline">
            Mensagens → Conexão
          </Link>{" "}
          para disparar campanhas.
        </Alert>
      ) : (
        <CampaignsPanel
          canSend={context.access === "full"}
          teams={teams}
          vehicles={vehicles}
          campaigns={campaigns.map((campaign) => ({
            id: campaign.id,
            name: campaign.name,
            purpose: campaign.purpose,
            templateName: campaign.templateName,
            status: campaign.status,
            total: campaign.total,
            sent: campaign.sent,
            failed: campaign.failed,
            createdByName: campaign.createdByName,
            createdAt: campaign.createdAt.toISOString(),
          }))}
        />
      )}
    </>
  );
}
