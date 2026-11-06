import type { Metadata } from "next";
import Form from "next/form";
import { PageHeader } from "@/components/layout/shell";
import { StatCard, StatGrid } from "@/components/admin/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label, Select } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/table";
import { requireTenantPage } from "@/lib/auth/guards";
import { can } from "@/lib/auth/rbac";
import { DAY_MS } from "@/lib/services/reports";
import { agendaBucket, listAgenda, type AgendaBucket } from "@/lib/services/lead-tasks";
import { listTeams } from "@/lib/services/teams";
import { listTenantUsers } from "@/lib/services/users";
import { formatNumber } from "@/lib/utils";
import { AgendaRow } from "./agenda-row";

export const metadata: Metadata = { title: "Agenda" };
export const dynamic = "force-dynamic";

const SECTIONS: { bucket: AgendaBucket; title: string; empty: string }[] = [
  { bucket: "overdue", title: "Atrasados", empty: "Nada atrasado." },
  { bucket: "today", title: "Hoje", empty: "Nada para hoje." },
  { bucket: "upcoming", title: "Próximos 14 dias", empty: "Nada agendado." },
];

type Props = { searchParams: Promise<{ responsavel?: string; equipe?: string }> };

export default async function AgendaPage({ searchParams }: Props) {
  const context = await requireTenantPage("leads:read");
  const params = await searchParams;

  const [users, teams] = await Promise.all([
    listTenantUsers(context.tenant.id),
    listTeams(context.tenant.id),
  ]);
  const active = users.filter((user) => user.status === "active");

  // vendedor abre na própria agenda; quem gerencia abre na de todos
  const fallback = context.role === "vendedor" ? context.user.id : "todos";
  const chosen = params.responsavel ?? fallback;
  const userId = active.some((user) => user.id === chosen) ? chosen : undefined;
  const team = teams.find((item) => item.id === params.equipe);

  const now = new Date();
  const tasks = await listAgenda(context.tenant.id, {
    userId,
    teamId: team?.id,
    until: new Date(now.getTime() + 14 * DAY_MS),
  });

  const grouped: Record<AgendaBucket, typeof tasks> = { overdue: [], today: [], upcoming: [] };
  for (const task of tasks) grouped[agendaBucket(task.dueAt, now)].push(task);

  const canWrite = can(context.role, "leads:write") && context.access === "full";

  return (
    <>
      <PageHeader
        title="Agenda"
        description="Retornos, visitas e test drives combinados com os clientes."
      />

      <StatGrid className="xl:grid-cols-3">
        <StatCard
          label="Atrasados"
          value={formatNumber(grouped.overdue.length)}
          tone={grouped.overdue.length > 0 ? "warning" : "default"}
          hint="passou da hora e não foi feito"
        />
        <StatCard label="Hoje" value={formatNumber(grouped.today.length)} />
        <StatCard label="Próximos 14 dias" value={formatNumber(grouped.upcoming.length)} />
      </StatGrid>

      <Card className="mb-3">
        <Form
          action="/admin/agenda"
          className="grid grid-cols-2 items-end gap-3 px-4 py-3.5 sm:flex sm:flex-wrap"
        >
          <div className="min-w-0">
            <Label htmlFor="responsavel">Responsável</Label>
            <Select
              id="responsavel"
              name="responsavel"
              defaultValue={userId ?? "todos"}
              className="w-full sm:w-52"
            >
              <option value="todos">Todos</option>
              {active.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </Select>
          </div>
          {teams.length > 0 ? (
            <div className="min-w-0">
              <Label htmlFor="equipe">Equipe</Label>
              <Select id="equipe" name="equipe" defaultValue={team?.id ?? ""} className="w-full sm:w-44">
                <option value="">Todas</option>
                {teams.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
          <Button type="submit" variant="secondary">
            Filtrar
          </Button>
        </Form>
      </Card>

      <div className="flex flex-col gap-4">
        {SECTIONS.map((section) => (
          <Card key={section.bucket}>
            <CardHeader>
              <CardTitle>{section.title}</CardTitle>
            </CardHeader>
            <CardContent>
              {grouped[section.bucket].length === 0 ? (
                <EmptyState title={section.empty} />
              ) : (
                <ul className="flex flex-col divide-y divide-border">
                  {grouped[section.bucket].map((task) => (
                    <AgendaRow
                      key={task.id}
                      canWrite={canWrite}
                      late={section.bucket === "overdue"}
                      task={{
                        id: task.id,
                        kind: task.kind,
                        dueAt: task.dueAt.toISOString(),
                        note: task.note,
                        leadId: task.leadId,
                        leadName: task.leadName,
                        leadPhone: task.leadPhone,
                        vehicleLabel: task.vehicleLabel,
                        assignedToName: task.assignedToName,
                      }}
                    />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
