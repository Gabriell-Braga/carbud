import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/shell";
import { requireTenantPage } from "@/lib/auth/guards";
import { assignableRoles, can } from "@/lib/auth/rbac";
import { listTenantUsers } from "@/lib/services/users";
import { listStores } from "@/lib/services/stores";
import { getRouting } from "@/lib/services/crm";
import { tenantHasFeature } from "@/lib/api/feature-guard";
import { TeamPanel } from "./team-panel";
import { TeamSettings } from "./team-settings";
import { TeamsCard } from "./teams-card";
import { listTeams } from "@/lib/services/teams";

export const metadata: Metadata = { title: "Usuários" };
export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const context = await requireTenantPage("users:read");
  const [members, stores, routing, hasDistribution, hasStores, hasPermissions, teams] = await Promise.all([
    listTenantUsers(context.tenant.id),
    listStores(context.tenant.id, true),
    getRouting(context.tenant.id),
    tenantHasFeature(context.tenant.id, "distribuicao_leads"),
    tenantHasFeature(context.tenant.id, "gestao_multiunidade"),
    tenantHasFeature(context.tenant.id, "permissoes_avancadas"),
    listTeams(context.tenant.id),
  ]);
  const canWrite = can(context.role, "users:write") && context.access === "full";

  return (
    <>
      <PageHeader
        title="Usuários"
        description="Controle quem acessa o painel e o que cada pessoa pode fazer."
      />
      <TeamPanel
        canWrite={canWrite}
        currentUserId={context.claims.sub}
        assignableRoles={assignableRoles(context.role)}
        stores={hasStores ? stores.map((store) => ({ id: store.id, name: store.name })) : []}
        teams={teams}
        showDistribution={hasDistribution}
        showPermissions={hasPermissions}
        members={members.map((member) => ({
          id: member.id,
          name: member.name,
          email: member.email,
          role: member.role,
          status: member.status,
          mustChangePassword: member.mustChangePassword,
          lastLoginAt: member.lastLoginAt?.toISOString() ?? null,
          storeId: member.storeId,
          teamId: member.teamId,
          receivesLeads: member.receivesLeads,
          permissionOverrides: member.permissionOverrides ?? null,
        }))}
      />

      {canWrite || teams.length > 0 ? <TeamsCard teams={teams} canWrite={canWrite} /> : null}

      {hasDistribution && canWrite ? (
        <TeamSettings mode={routing.mode} hasStores={hasStores} />
      ) : null}
    </>
  );
}
