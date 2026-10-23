import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/shell";
import { StatCard, StatGrid } from "@/components/admin/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { Input, Label } from "@/components/ui/field";
import { EmptyState, Table, Td, Th, Thead, Tr } from "@/components/ui/table";
import { requireSuperAdminPage } from "@/lib/auth/guards";
import { formatBps } from "@/lib/affiliates/rules";
import { brazilIsoDate } from "@/lib/gateway/brazil-date";
import {
  affiliateStatement,
  affiliateTotals,
  brazilMonthPeriod,
  getAffiliate,
  listAffiliateTenants,
} from "@/lib/services/affiliates";
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils";
import { EditAffiliateButton, PayoutForm, VoidPayoutButton } from "./affiliate-detail-actions";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mes?: string; pagina?: string }>;
};

export const metadata: Metadata = { title: "Afiliado" };

const SOURCE_LABELS: Record<string, string> = {
  tenant_create: "Cadastro",
  subscription: "Contratação",
  admin: "Correção",
};

const KIND_LABELS: Record<string, string> = {
  commission: "Comissão",
  adjustment: "Ajuste",
  payout: "Repasse",
};

export default async function AffiliateDetailPage({ params, searchParams }: Props) {
  await requireSuperAdminPage();
  const { id } = await params;
  const { mes, pagina } = await searchParams;

  const affiliate = await getAffiliate(id).catch(() => null);
  if (!affiliate) notFound();

  const month = mes ?? brazilIsoDate(new Date()).slice(0, 7);
  const period = brazilMonthPeriod(month);
  const page = Math.max(1, Number(pagina) || 1);

  const [totalsMap, referredTenants, statement] = await Promise.all([
    affiliateTotals([id], period),
    listAffiliateTenants(id),
    affiliateStatement(id, page),
  ]);
  const totals = totalsMap.get(id)!;
  const monthTotals = totals.period;

  const pageHref = (target: number) =>
    `/super-admin/afiliados/${id}?mes=${month}&pagina=${target}`;

  return (
    <>
      <PageHeader
        eyebrow="Afiliado"
        title={affiliate.name}
        description={[affiliate.email, affiliate.phone].filter(Boolean).join(" · ") || undefined}
        actions={
          <EditAffiliateButton
            affiliate={{
              id: affiliate.id,
              name: affiliate.name,
              email: affiliate.email,
              phone: affiliate.phone,
              notes: affiliate.notes,
              status: affiliate.status,
              defaultCommissionBps: affiliate.defaultCommissionBps,
            }}
          />
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Badge tone={affiliate.status === "active" ? "success" : "neutral"}>
          {affiliate.status === "active" ? "Ativo" : "Inativo"}
        </Badge>
        <span className="font-mono text-[13px] text-text">{affiliate.code}</span>
        <CopyButton value={affiliate.code} label="Copiar código" />
        <span className="text-[13px] text-muted">
          Comissão para novas indicações: {formatBps(affiliate.defaultCommissionBps)}
        </span>
      </div>

      <h2 className="label-instrument mb-2 text-muted">Acumulado</h2>
      <StatGrid className="mb-6 xl:grid-cols-4">
        <StatCard label="Comissão líquida" value={formatCurrency(totals.netCents)} hint="Créditos mais ajustes" />
        <StatCard label="Repassado" value={formatCurrency(totals.paidOutCents)} />
        <StatCard
          label="Saldo"
          value={formatCurrency(totals.balanceCents)}
          tone={totals.balanceCents < 0 ? "danger" : "default"}
          hint="Pode ficar negativo após estorno de valor já repassado"
        />
        <StatCard
          label="Disponível para repasse"
          value={formatCurrency(Math.max(0, totals.availableCents))}
          hint={totals.heldCents ? `${formatCurrency(totals.heldCents)} retidos em contestação` : undefined}
        />
      </StatGrid>

      <Card className="mb-4">
        <CardHeader className="flex flex-row flex-wrap items-end justify-between gap-4">
          <div>
            <CardTitle>No mês</CardTitle>
            <CardDescription>
              Indicações pela data da atribuição, comissões pela data da confirmação do pagamento,
              ajustes pelo lançamento e repasses pela data do repasse. Horário de Brasília.
            </CardDescription>
          </div>
          <Form className="flex items-end gap-2" action={`/super-admin/afiliados/${id}`}>
            <div>
              <Label htmlFor="affiliate-month">Mês</Label>
              <Input id="affiliate-month" type="month" name="mes" defaultValue={month} />
            </div>
            <Button type="submit" variant="secondary">
              Ver
            </Button>
          </Form>
        </CardHeader>
        <CardContent>
          {monthTotals ? (
            <StatGrid className="xl:grid-cols-5">
              <StatCard label="Indicadas" value={formatNumber(monthTotals.referred)} />
              <StatCard label="Convertidas" value={formatNumber(monthTotals.converted)} hint="Primeiro pagamento no mês" />
              <StatCard label="Comissão bruta" value={formatCurrency(monthTotals.grossCents)} />
              <StatCard
                label="Ajustes"
                value={formatCurrency(monthTotals.adjustmentsCents)}
                tone={monthTotals.adjustmentsCents < 0 ? "warning" : "default"}
              />
              <StatCard label="Repassado" value={formatCurrency(monthTotals.paidOutCents)} />
            </StatGrid>
          ) : (
            <p className="text-[13px] text-muted">Mês inválido.</p>
          )}
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Revendas indicadas</CardTitle>
          <CardDescription>
            {formatNumber(totals.referred)} indicadas, {formatNumber(totals.converted)} com pagamento
            confirmado
            {totals.reverted ? `, ${formatNumber(totals.reverted)} com a comissão toda estornada` : ""}.
          </CardDescription>
        </CardHeader>
        {referredTenants.length === 0 ? (
          <EmptyState title="Nenhuma revenda indicada" description="O código ainda não foi usado." />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Revenda</Th>
                <Th>Origem</Th>
                <Th numeric>Indicada em</Th>
                <Th numeric>Percentual</Th>
                <Th numeric>1º pagamento</Th>
                <Th numeric>Comissão líquida</Th>
              </Tr>
            </Thead>
            <tbody>
              {referredTenants.map((row) => (
                <Tr key={row.tenantId}>
                  <Td>
                    <Link
                      href={`/super-admin/revendas/${row.tenantId}?aba=financeiro`}
                      className="font-medium text-text hover:underline"
                    >
                      {row.tenantName}
                    </Link>
                    {row.tenantStatus === "deleted" ? (
                      <div className="text-xs text-faint">Excluída</div>
                    ) : null}
                  </Td>
                  <Td>{SOURCE_LABELS[row.source] ?? row.source}</Td>
                  <Td numeric>{formatDate(row.attributedAt)}</Td>
                  <Td numeric>{formatBps(row.commissionBps)}</Td>
                  <Td numeric>{row.firstPaymentAt ? formatDate(row.firstPaymentAt) : "Sem pagamento"}</Td>
                  <Td numeric>{formatCurrency(Number(row.netCents))}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <PayoutForm affiliateId={id} availableCents={Math.max(0, totals.availableCents)} />

      <Card>
        <CardHeader>
          <CardTitle>Extrato</CardTitle>
          <CardDescription>
            Comissão nasce de pagamento confirmado e nunca é reescrita: estorno e contestação
            aparecem como ajuste.
          </CardDescription>
        </CardHeader>
        {statement.entries.length === 0 ? (
          <EmptyState title="Sem lançamentos" description="Nenhum pagamento confirmado ainda." />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th numeric>Data</Th>
                <Th>Tipo</Th>
                <Th>Revenda / referência</Th>
                <Th numeric>Base</Th>
                <Th numeric>Valor</Th>
                <Th />
              </Tr>
            </Thead>
            <tbody>
              {statement.entries.map((entry) => (
                <Tr key={`${entry.kind}:${entry.id}`}>
                  <Td numeric>{formatDate(entry.at)}</Td>
                  <Td>
                    {KIND_LABELS[entry.kind]}
                    {entry.kind === "commission" && entry.status === "held" ? (
                      <Badge tone="warning" className="ml-2">
                        Retida
                      </Badge>
                    ) : null}
                    {entry.kind === "payout" && entry.status === "voided" ? (
                      <Badge tone="neutral" className="ml-2">
                        Anulado
                      </Badge>
                    ) : null}
                  </Td>
                  <Td>
                    {entry.tenantName ?? ""}
                    {entry.detail ? <div className="text-xs text-faint">{entry.detail}</div> : null}
                  </Td>
                  <Td numeric>
                    {entry.baseCents !== null
                      ? `${formatCurrency(entry.baseCents)} × ${formatBps(entry.commissionBps ?? 0)}`
                      : ""}
                  </Td>
                  <Td numeric className={entry.status === "voided" ? "line-through" : undefined}>
                    {formatCurrency(entry.amountCents)}
                  </Td>
                  <Td>
                    {entry.kind === "payout" && entry.status === "recorded" ? (
                      <VoidPayoutButton affiliateId={id} payoutId={entry.id} />
                    ) : null}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        {page > 1 || statement.hasMore ? (
          <div className="flex justify-end gap-2 border-t border-border p-3">
            {page > 1 ? (
              <Link href={pageHref(page - 1)}>
                <Button variant="secondary" size="sm">
                  Mais recentes
                </Button>
              </Link>
            ) : null}
            {statement.hasMore ? (
              <Link href={pageHref(page + 1)}>
                <Button variant="secondary" size="sm">
                  Mais antigos
                </Button>
              </Link>
            ) : null}
          </div>
        ) : null}
      </Card>
    </>
  );
}
