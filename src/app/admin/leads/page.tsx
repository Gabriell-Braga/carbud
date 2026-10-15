import type { Metadata } from "next";
import Form from "next/form";
import { PageHeader } from "@/components/layout/shell";
import { Pagination } from "@/components/admin/pagination";
import { StatCard, StatGrid } from "@/components/admin/stat-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/field";
import { EmptyState, Table, Th, Thead, Tr } from "@/components/ui/table";
import { LEAD_STATUS, type LeadStatus } from "@/db/schema";
import { requireTenantPage } from "@/lib/auth/guards";
import { can } from "@/lib/auth/rbac";
import { LEAD_STATUS_LABELS } from "@/lib/catalog/labels";
import { getLeadStats, listLeads } from "@/lib/services/leads";
import { listTenantUsers } from "@/lib/services/users";
import { formatNumber } from "@/lib/utils";
import { LeadRow } from "./lead-row";

export const metadata: Metadata = { title: "Leads" };
export const dynamic = "force-dynamic";

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const context = await requireTenantPage("leads:read");
  const params = await searchParams;

  const status = LEAD_STATUS.includes(params.status as LeadStatus)
    ? (params.status as LeadStatus)
    : undefined;

  const [stats, result, teamMembers] = await Promise.all([
    getLeadStats(context.tenant.id),
    listLeads(context.tenant.id, {
      search: params.q?.trim() || undefined,
      status,
      page: Number(params.page ?? 1) || 1,
    }),
    listTenantUsers(context.tenant.id),
  ]);

  const canWrite = can(context.role, "leads:write") && context.access === "full";

  return (
    <>
      <PageHeader
        title="Leads"
        description="Contatos recebidos pelo site da revenda e pelos portais de classificados."
      />

      <StatGrid>
        <StatCard
          label="Novos"
          value={formatNumber(stats.new)}
          tone={stats.new > 0 ? "warning" : "default"}
          hint="Sem primeiro contato"
        />
        <StatCard label="Em atendimento" value={formatNumber(stats.in_progress)} />
        <StatCard label="Convertidos" value={formatNumber(stats.won)} tone="success" />
        <StatCard label="Perdidos" value={formatNumber(stats.lost)} />
        <StatCard label="Total recebido" value={formatNumber(stats.total)} />
      </StatGrid>

      <Card className="mb-3">
        <Form
          className="grid grid-cols-2 items-end gap-3 px-4 py-3.5 sm:flex sm:flex-wrap"
          action="/admin/leads"
        >
          <div className="col-span-2 sm:min-w-56 sm:flex-1">
            <Label htmlFor="q">Buscar</Label>
            <Input
              id="q"
              name="q"
              defaultValue={params.q ?? ""}
              placeholder="Nome, telefone, e-mail ou veículo"
            />
          </div>
          <div className="min-w-0">
            <Label htmlFor="status">Situação</Label>
            <Select id="status" name="status" defaultValue={status ?? ""} className="w-full sm:w-44">
              <option value="">Todas</option>
              {LEAD_STATUS.map((value) => (
                <option key={value} value={value}>
                  {LEAD_STATUS_LABELS[value]}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" variant="secondary">
            Filtrar
          </Button>
        </Form>
      </Card>

      <Card>
        {result.items.length === 0 ? (
          <EmptyState
            title="Nenhum lead ainda"
            description="Quando alguém preencher o formulário do seu site, o contato aparece aqui."
          />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Cliente</Th>
                <Th>Interesse</Th>
                <Th>Situação</Th>
                <Th>Responsável</Th>
                <Th numeric>Recebido</Th>
                <Th />
              </Tr>
            </Thead>
            <tbody>
              {result.items.map((lead) => (
                <LeadRow
                  key={lead.id}
                  canWrite={canWrite}
                  assignees={teamMembers
                    .filter((user) => user.status === "active")
                    .map((user) => ({ id: user.id, name: user.name }))}
                  lead={{
                    id: lead.id,
                    name: lead.name,
                    phone: lead.phone,
                    email: lead.email,
                    message: lead.message,
                    vehicleLabel: lead.vehicleLabel,
                    status: lead.status,
                    internalNotes: lead.internalNotes,
                    assignedToUserId: lead.assignedToUserId,
                    assignedToName: lead.assignedToName,
                    utmSource: lead.utm?.source ?? null,
                    createdAt: lead.createdAt.toISOString(),
                  }}
                />
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Pagination
        basePath="/admin/leads"
        page={result.page}
        total={result.total}
        pageSize={result.pageSize}
        params={{ q: params.q, status }}
      />
    </>
  );
}
