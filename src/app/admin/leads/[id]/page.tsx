import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/shell";
import { requireTenantPage } from "@/lib/auth/guards";
import { can } from "@/lib/auth/rbac";
import { tenantHasFeature } from "@/lib/api/feature-guard";
import { listLeadEvents, listStages } from "@/lib/services/crm";
import { getLead } from "@/lib/services/leads";
import { listTenantUsers } from "@/lib/services/users";
import { listVehicleOptions } from "@/lib/services/vehicles";
import { ensureTemplates } from "@/lib/services/message-templates";
import { LeadDetail } from "./lead-detail";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const context = await requireTenantPage("leads:read");
  const lead = await getLead(context.tenant.id, id);
  return { title: lead ? lead.name : "Lead" };
}

export default async function LeadDetailPage({ params }: Props) {
  const { id } = await params;
  const context = await requireTenantPage("leads:read");

  const lead = await getLead(context.tenant.id, id);
  if (!lead) notFound();

  const hasTimeline = await tenantHasFeature(context.tenant.id, "historico_conversas");
  const hasFunnel = await tenantHasFeature(context.tenant.id, "funil_comercial");

  const canWrite = can(context.role, "leads:write");
  const [events, stages, users, templates, vehicleOptions] = await Promise.all([
    hasTimeline ? listLeadEvents(context.tenant.id, id) : Promise.resolve([]),
    hasFunnel ? listStages(context.tenant.id) : Promise.resolve([]),
    listTenantUsers(context.tenant.id),
    ensureTemplates(context.tenant.id),
    canWrite ? listVehicleOptions(context.tenant.id) : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader
        title={lead.name}
        description={lead.vehicleLabel ?? "Sem veículo vinculado"}
      />
      <LeadDetail
        lead={{
          id: lead.id,
          name: lead.name,
          phone: lead.phone,
          email: lead.email,
          message: lead.message,
          vehicleId: lead.vehicleId,
          vehicleLabel: lead.vehicleLabel,
          status: lead.status,
          stageId: lead.stageId,
          assignedToUserId: lead.assignedToUserId,
          internalNotes: lead.internalNotes,
          source: lead.source,
          utm: lead.utm ?? null,
          createdAt: lead.createdAt.toISOString(),
        }}
        stages={stages.map((stage) => ({ id: stage.id, name: stage.name, kind: stage.kind }))}
        assignees={users
          .filter((user) => user.status === "active")
          .map((user) => ({ id: user.id, name: user.name }))}
        events={events.map((event) => ({
          id: event.id,
          type: event.type,
          body: event.body,
          userName: event.userName,
          createdAt: event.createdAt.toISOString(),
        }))}
        canWrite={canWrite}
        vehicleOptions={vehicleOptions}
        templates={templates.map((template) => ({
          id: template.id,
          name: template.name,
          body: template.body,
          active: template.active,
        }))}
        sender={{ name: context.user.name, tenantName: context.tenant.name }}
        hasTimeline={hasTimeline}
        hasFunnel={hasFunnel}
      />
    </>
  );
}
