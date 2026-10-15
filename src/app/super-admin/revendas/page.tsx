import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { PageHeader } from "@/components/layout/shell";
import { BillingStatusBadge, TenantStatusBadge } from "@/components/admin/status-badges";
import { Pagination } from "@/components/admin/pagination";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/field";
import { EmptyState, Table, Td, Th, Thead, Tr } from "@/components/ui/table";
import { BILLING_STATUS, TENANT_STATUS, type BillingStatus, type TenantStatus } from "@/db/schema";
import { BILLING_STATUS_LABELS } from "@/lib/catalog/labels";
import { listTenants } from "@/lib/services/tenants";
import { getTemplateManifest } from "@carbud/site-kit/manifests";
import { formatCurrency, formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Revendas" };
export const dynamic = "force-dynamic";

const TENANT_STATUS_LABELS: Record<TenantStatus, string> = {
  active: "Ativa",
  suspended: "Suspensa",
  deleted: "Excluída",
};

export default async function TenantsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; billing?: string; page?: string }>;
}) {
  const params = await searchParams;
  const status = TENANT_STATUS.includes(params.status as TenantStatus)
    ? (params.status as TenantStatus)
    : undefined;
  const billing = BILLING_STATUS.includes(params.billing as BillingStatus)
    ? (params.billing as BillingStatus)
    : undefined;

  const result = await listTenants({
    search: params.q?.trim() || undefined,
    status: status === "deleted" ? undefined : status,
    billing,
    page: Number(params.page ?? 1) || 1,
  });

  return (
    <>
      <PageHeader
        title="Revendas"
        description={`${result.total} cadastrada(s) na plataforma.`}
        actions={
          <Link href="/super-admin/revendas/nova">
            <Button>Nova revenda</Button>
          </Link>
        }
      />

      <Card className="mb-3">
        <Form className="flex flex-wrap items-end gap-3 px-4 py-3.5" action="/super-admin/revendas">
          <div className="min-w-56 flex-1">
            <Label htmlFor="q">Buscar</Label>
            <Input id="q" name="q" defaultValue={params.q ?? ""} placeholder="Nome ou slug" />
          </div>
          <div>
            <Label htmlFor="status">Situação</Label>
            <Select id="status" name="status" defaultValue={status ?? ""} className="w-36">
              <option value="">Todas</option>
              {TENANT_STATUS.filter((value) => value !== "deleted").map((value) => (
                <option key={value} value={value}>
                  {TENANT_STATUS_LABELS[value]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="billing">Financeiro</Label>
            <Select id="billing" name="billing" defaultValue={billing ?? ""} className="w-40">
              <option value="">Todos</option>
              {BILLING_STATUS.map((value) => (
                <option key={value} value={value}>
                  {BILLING_STATUS_LABELS[value]}
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
            title="Nenhuma revenda encontrada"
            description="Ajuste os filtros ou cadastre uma nova revenda."
            action={
              <Link href="/super-admin/revendas/nova">
                <Button size="sm">Cadastrar revenda</Button>
              </Link>
            }
          />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Revenda</Th>
                <Th>Template</Th>
                <Th>Situação</Th>
                <Th>Financeiro</Th>
                <Th numeric>Mensalidade</Th>
                <Th numeric>Vencimento</Th>
                <Th />
              </Tr>
            </Thead>
            <tbody>
              {result.items.map((tenant) => (
                <Tr key={tenant.id}>
                  <Td>
                    <Link
                      href={`/super-admin/revendas/${tenant.id}`}
                      className="font-medium text-text transition-colors hover:text-accent-text"
                    >
                      {tenant.name}
                    </Link>
                    <p className="text-xs text-faint">/r/{tenant.slug}</p>
                  </Td>
                  <Td className="text-muted">{getTemplateManifest(tenant.templateId).name}</Td>
                  <Td>
                    <TenantStatusBadge status={tenant.status} />
                  </Td>
                  <Td>
                    <BillingStatusBadge status={tenant.billingStatus} />
                  </Td>
                  <Td numeric>
                    {tenant.amountCents ? formatCurrency(tenant.amountCents) : "—"}
                  </Td>
                  <Td numeric>{formatDate(tenant.currentDueDate)}</Td>
                  <Td className="text-right">
                    <Link href={`/super-admin/revendas/${tenant.id}`}>
                      <Button size="sm" variant="secondary">
                        Gerenciar
                      </Button>
                    </Link>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Pagination
        basePath="/super-admin/revendas"
        page={result.page}
        total={result.total}
        pageSize={result.pageSize}
        params={{ q: params.q, status, billing }}
      />
    </>
  );
}
