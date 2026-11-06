import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/shell";
import { StatCard, StatGrid } from "@/components/admin/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/table";
import { FeatureLocked } from "@/components/admin/feature-locked";
import { requireTenantPage } from "@/lib/auth/guards";
import { tenantHasFeature, tierOf } from "@/lib/api/feature-guard";
import { buildSalesReport, type Period } from "@/lib/services/reports";
import { financingSummary } from "@/lib/services/financings";
import { formatCurrency, formatNumber } from "@/lib/utils";
import {
  FINANCING_STATUS_LABELS,
  LEAD_SOURCE_LABELS,
  LOST_REASON_LABELS,
} from "@/lib/catalog/labels";
import type { FinancingStatus, LeadSource, LostReason } from "@/db/schema";
import { buildAttendanceReport, formatWait } from "@/lib/services/attendance";
import { Bars } from "./bars";
import { PeriodPicker } from "./period-picker";

export const metadata: Metadata = { title: "Relatórios" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ periodo?: string }> };

const PERIODS: Period[] = [7, 30, 90];

export default async function ReportsPage({ searchParams }: Props) {
  const context = await requireTenantPage("reports:read");

  if (!(await tenantHasFeature(context.tenant.id, "dashboards"))) {
    return (
      <>
        <PageHeader title="Relatórios" description="Como está a operação comercial." />
        <FeatureLocked
          title="Relatórios não estão no plano desta revenda"
          description="Eles mostram de onde vêm os leads, quanto se converte, quem atende e o que está parado no estoque."
        />
      </>
    );
  }

  const { periodo } = await searchParams;
  const period = (PERIODS.includes(Number(periodo) as Period) ? Number(periodo) : 30) as Period;

  const [report, attendance, tier, financings] = await Promise.all([
    buildSalesReport(context.tenant.id, period),
    buildAttendanceReport(context.tenant.id, period),
    tierOf(context.tenant.id, "dashboards"),
    tenantHasFeature(context.tenant.id, "gestao_financiamentos").then((has) =>
      has ? financingSummary(context.tenant.id) : [],
    ),
  ]);

  // "básico" entrega os números da operação; nível maior abre o corte por pessoa
  const detailed = tier === "completo" || tier === "avancado";

  return (
    <>
      <PageHeader
        title="Relatórios"
        description={`Leads e estoque nos últimos ${period} dias.`}
        actions={<PeriodPicker current={period} options={PERIODS} />}
      />

      <StatGrid className="xl:grid-cols-5">
        <StatCard
          label="Leads recebidos"
          value={formatNumber(report.leads.total)}
          hint="contatos que chegaram no período"
        />
        <StatCard
          label="Em atendimento"
          value={formatNumber(report.leads.emAberto)}
          hint="ainda sem venda nem perda"
        />
        <StatCard
          label="Vendas"
          value={formatNumber(report.leads.ganhos)}
          hint="leads que viraram venda"
        />
        <StatCard
          label="Taxa de venda"
          value={report.conversao === null ? "—" : `${report.conversao}%`}
          hint={
            report.conversao === null
              ? "nenhum lead fechado ainda"
              : "das negociações encerradas, quantas viraram venda"
          }
        />
        <StatCard
          label="Carros à venda"
          value={formatNumber(report.estoque.disponiveis + report.estoque.reservados)}
          hint="disponíveis e reservados"
        />
      </StatGrid>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>De onde vêm os leads</CardTitle>
            <CardDescription>Por onde cada contato chegou: site, WhatsApp, portais, telefone.</CardDescription>
          </CardHeader>
          <CardContent>
            {report.porOrigem.length === 0 ? (
              <EmptyState title="Nenhum lead no período" />
            ) : (
              <Bars
                items={report.porOrigem.map((row) => ({
                  label: LEAD_SOURCE_LABELS[row.origem as LeadSource] ?? row.origem,
                  value: row.total,
                }))}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Onde os leads estão</CardTitle>
            <CardDescription>Em que etapa do funil estão os leads do período.</CardDescription>
          </CardHeader>
          <CardContent>
            {report.porEtapa.length === 0 ? (
              <EmptyState
                title="Funil não configurado"
                description="Abra o funil comercial para montar as etapas."
              />
            ) : (
              <Bars items={report.porEtapa.map((row) => ({ label: row.etapa, value: row.total }))} />
            )}
          </CardContent>
        </Card>

        {detailed ? (
          <Card>
            <CardHeader>
              <CardTitle>Por vendedor</CardTitle>
              <CardDescription>Leads recebidos e vendas fechadas por cada um no período.</CardDescription>
            </CardHeader>
            <CardContent>
              {report.porVendedor.length === 0 ? (
                <EmptyState title="Nenhum vendedor cadastrado" />
              ) : (
                <Bars
                  items={report.porVendedor.map((row) => ({
                    label: row.nome,
                    value: row.total,
                    detail: row.ganhos === 1 ? "1 venda" : `${row.ganhos} vendas`,
                  }))}
                />
              )}
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Estoque</CardTitle>
            <CardDescription>Quantos carros, quanto dinheiro está no pátio e o que não sai.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-[13px]">
            <Line label="Disponíveis" value={formatNumber(report.estoque.disponiveis)} />
            <Line label="Reservados" value={formatNumber(report.estoque.reservados)} />
            <Line label="Vendidos (desde o início)" value={formatNumber(report.estoque.vendidos)} />
            <Line label="Valor em estoque" value={formatCurrency(report.estoque.valorTotalCents)} />
            <Line label="Preço médio" value={formatCurrency(report.estoque.precoMedioCents)} />
            <Line
              label="Parados há mais de 60 dias"
              value={formatNumber(report.estoque.paradosMais60)}
              alert={report.estoque.paradosMais60 > 0}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Por que as vendas não saíram</CardTitle>
            <CardDescription>Motivo marcado ao dar o lead como perdido, no período.</CardDescription>
          </CardHeader>
          <CardContent>
            {attendance.motivosPerda.length === 0 ? (
              <EmptyState title="Nenhuma perda com motivo no período" />
            ) : (
              <Bars
                items={attendance.motivosPerda.map((row) => ({
                  label: LOST_REASON_LABELS[row.motivo as LostReason] ?? row.motivo,
                  value: row.total,
                }))}
              />
            )}
          </CardContent>
        </Card>

        {detailed && attendance.agenda.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Agenda da equipe</CardTitle>
              <CardDescription>Retornos feitos no período e o que está atrasado agora.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-[13px]">
              {attendance.agenda.map((row) => (
                <Line
                  key={row.nome}
                  label={row.nome}
                  value={`${formatNumber(row.feitas)} feitos · ${formatNumber(row.atrasadas)} atrasados`}
                  alert={row.atrasadas > 0}
                />
              ))}
            </CardContent>
          </Card>
        ) : null}

        {financings.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Financiamentos</CardTitle>
              <CardDescription>Propostas por situação, com valor financiado.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-[13px]">
              {financings.map((row) => (
                <Line
                  key={row.status}
                  label={FINANCING_STATUS_LABELS[row.status as FinancingStatus] ?? row.status}
                  value={`${row.quantidade} · ${formatCurrency(row.valorCents)}`}
                />
              ))}
            </CardContent>
          </Card>
        ) : null}
      </div>

      <h2 className="mb-3 mt-8 text-sm font-medium text-text">Atendimento pelo WhatsApp</h2>
      <StatGrid className="xl:grid-cols-4">
        <StatCard
          label="Conversas"
          value={formatNumber(attendance.conversas)}
          hint="clientes que mandaram mensagem"
        />
        <StatCard
          label="Contatos novos"
          value={formatNumber(attendance.novosContatos)}
          hint="viraram lead pelo WhatsApp"
        />
        <StatCard
          label="Tempo de resposta"
          value={formatWait(attendance.medianaRespostaMin)}
          hint="mediana até a primeira resposta"
        />
        <StatCard
          label="Esperando resposta"
          value={formatNumber(attendance.aguardando)}
          tone={attendance.aguardando > 0 ? "warning" : "default"}
          hint="cliente falou por último"
        />
      </StatGrid>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Conversas por dia</CardTitle>
            <CardDescription>
              {formatNumber(attendance.recebidas)} mensagens recebidas e{" "}
              {formatNumber(attendance.enviadas)} enviadas no período.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {attendance.porDia.length === 0 ? (
              <EmptyState title="Nenhuma conversa no período" />
            ) : (
              <Bars
                items={attendance.porDia.map((row) => ({
                  label: row.dia.split("-").reverse().slice(0, 2).join("/"),
                  value: row.conversas,
                }))}
              />
            )}
          </CardContent>
        </Card>

        {detailed ? (
          <Card>
            <CardHeader>
              <CardTitle>Por atendente</CardTitle>
              <CardDescription>Conversas respondidas por cada pessoa. Campanhas ficam de fora.</CardDescription>
            </CardHeader>
            <CardContent>
              {attendance.porAtendente.length === 0 ? (
                <EmptyState title="Ninguém respondeu pelo painel no período" />
              ) : (
                <Bars
                  items={attendance.porAtendente.map((row) => ({
                    label: row.nome,
                    value: row.conversas,
                    detail: `${formatNumber(row.mensagens)} msgs`,
                  }))}
                />
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}

function Line({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border pb-2 last:border-0 last:pb-0">
      <span className="text-muted">{label}</span>
      <span className={alert ? "tabular-nums text-warning" : "tabular-nums text-text"}>{value}</span>
    </div>
  );
}
