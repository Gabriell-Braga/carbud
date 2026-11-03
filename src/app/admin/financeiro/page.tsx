import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/layout/shell";
import { StatCard, StatGrid } from "@/components/admin/stat-card";
import { VehicleStatusBadge } from "@/components/admin/status-badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/field";
import { EmptyState, Table, Td, Th, Thead, Tr } from "@/components/ui/table";
import { allows, requireTenantPage } from "@/lib/auth/guards";
import { formatPlate } from "@/lib/format/plate";
import { withBasePath } from "@/lib/paths";
import { listFinanceRows, listStoreExpenses, summarizeFinance } from "@/lib/services/vehicle-finance";
import { financeFiltersSchema } from "@/lib/validation/finance";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";
import { StoreExpenses } from "./store-expenses";

export const metadata: Metadata = { title: "Financeiro" };
export const dynamic = "force-dynamic";

const day = (value: string | null) => (value ? value.split("-").reverse().join("/") : "—");
const pct = (value: number | null) => (value == null ? "—" : `${value.toFixed(1).replace(".", ",")}%`);

/**
 * Compra, custos, venda e margem de cada carro, e quem comprou o quê.
 *
 * É a parte do ERP que as lojas pediram (veio da Dri-Car): a busca aceita
 * nome ou CPF do comprador, então "quais clientes compraram quais carros" é
 * digitar o nome. A planilha sai com os mesmos filtros da tela.
 */
export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const context = await requireTenantPage("finance:read");
  const params = await searchParams;
  const filters = financeFiltersSchema.parse({
    q: params.q?.trim() || undefined,
    situation: params.situation,
    from: params.from || undefined,
    to: params.to || undefined,
  });

  const [rows, storeExpenses, canWrite] = await Promise.all([
    listFinanceRows(context.tenant.id, filters),
    listStoreExpenses(context.tenant.id, filters),
    allows(context, context.tenant.id, "finance:write"),
  ]);
  const summary = summarizeFinance(rows);
  const fixedCents = storeExpenses.reduce((sum, item) => sum + item.amountCents, 0);
  const netCents = summary.profitCents - fixedCents;
  const periodLabel =
    filters.from || filters.to
      ? `De ${filters.from ? day(filters.from) : "o início"} até ${filters.to ? day(filters.to) : "hoje"}`
      : "Desde o início";

  const query = new URLSearchParams(
    Object.entries(filters).filter((entry): entry is [string, string] => Boolean(entry[1])),
  ).toString();

  return (
    <>
      <PageHeader
        title="Financeiro"
        description="Compra, custos, venda e margem por veículo. Lance os valores na ficha de cada carro."
        actions={
          <a href={withBasePath(`/api/admin/finance/export${query ? `?${query}` : ""}`)}>
            <Button variant="secondary">
              <Download className="h-3.5 w-3.5" />
              Baixar planilha
            </Button>
          </a>
        }
      />

      <StatGrid className="xl:grid-cols-3">
        <StatCard label="Vendas com margem" value={formatNumber(summary.soldCount)} hint="com compra e venda lançadas" />
        <StatCard label="Receita" value={formatCurrency(summary.revenueCents)} />
        <StatCard
          label="Lucro dos carros"
          value={formatCurrency(summary.profitCents)}
          hint={`margem ${pct(summary.marginPct)}`}
          tone={summary.profitCents >= 0 ? "success" : "danger"}
        />
        <StatCard label="Custos fixos" value={formatCurrency(fixedCents)} hint="aluguel, salários, contas" />
        <StatCard
          label="Lucro líquido"
          value={formatCurrency(netCents)}
          hint="lucro dos carros − custos fixos"
          tone={netCents >= 0 ? "success" : "danger"}
        />
        <StatCard label="Investido no pátio" value={formatCurrency(summary.stockCostCents)} hint="compra + custos dos não vendidos" />
      </StatGrid>

      <Card className="mb-3">
        <Form
          className="grid grid-cols-2 items-end gap-3 px-4 py-3.5 sm:flex sm:flex-wrap"
          action="/admin/financeiro"
        >
          <div className="col-span-2 sm:min-w-56 sm:flex-1">
            <Label htmlFor="q">Buscar</Label>
            <Input
              id="q"
              name="q"
              defaultValue={filters.q ?? ""}
              placeholder="Carro, placa, comprador, CPF ou origem"
            />
          </div>
          <div className="min-w-0">
            <Label htmlFor="situation">Situação</Label>
            <Select id="situation" name="situation" defaultValue={filters.situation} className="w-full sm:w-36">
              <option value="todos">Todos</option>
              <option value="estoque">Em estoque</option>
              <option value="vendidos">Vendidos</option>
            </Select>
          </div>
          <div className="min-w-0">
            <Label htmlFor="from">Período: de</Label>
            <Input id="from" name="from" type="date" defaultValue={filters.from ?? ""} />
          </div>
          <div className="min-w-0">
            <Label htmlFor="to">até</Label>
            <Input id="to" name="to" type="date" defaultValue={filters.to ?? ""} />
          </div>
          <Button type="submit" variant="secondary" className="col-span-2 sm:col-span-1">
            Filtrar
          </Button>
        </Form>
      </Card>

      <Card>
        {rows.length === 0 ? (
          <EmptyState
            title="Nada neste filtro"
            description="Abra um veículo no estoque e preencha o card Financeiro do veículo."
          />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Veículo</Th>
                <Th className="hidden lg:table-cell">Origem</Th>
                <Th numeric className="hidden md:table-cell">Compra</Th>
                <Th numeric className="hidden md:table-cell">Custos</Th>
                <Th numeric className="hidden md:table-cell">Venda</Th>
                <Th numeric>Lucro</Th>
                <Th className="hidden lg:table-cell">Comprador</Th>
              </Tr>
            </Thead>
            <tbody>
              {rows.map((row) => (
                <Tr key={row.vehicleId}>
                  <Td className="w-full md:w-auto">
                    <Link
                      href={`/admin/estoque/${row.vehicleId}`}
                      className="font-medium text-text transition-colors hover:text-accent-text"
                    >
                      {row.brand} {row.model}
                    </Link>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-faint">
                      <span className="tnum">{row.years}</span>
                      {row.licensePlate ? (
                        <span className="font-mono">{formatPlate(row.licensePlate)}</span>
                      ) : null}
                      <VehicleStatusBadge status={row.status} />
                      {row.isAuction ? <Badge tone="warning">Leilão</Badge> : null}
                    </div>
                  </Td>
                  <Td className="hidden text-muted lg:table-cell">
                    {row.purchaseSource ?? "—"}
                    <span className="block text-xs text-faint">{day(row.purchaseDate)}</span>
                  </Td>
                  <Td numeric className="hidden whitespace-nowrap md:table-cell">
                    {row.purchasePriceCents == null ? "—" : formatCurrency(row.purchasePriceCents)}
                  </Td>
                  <Td numeric className="hidden whitespace-nowrap text-muted md:table-cell">
                    {row.expensesCents ? formatCurrency(row.expensesCents) : "—"}
                  </Td>
                  <Td numeric className="hidden whitespace-nowrap md:table-cell">
                    {row.salePriceCents == null ? "—" : formatCurrency(row.salePriceCents)}
                    <span className="block text-xs text-faint">{row.saleDate ? day(row.saleDate) : ""}</span>
                  </Td>
                  <Td
                    numeric
                    className={cn(
                      "whitespace-nowrap font-medium",
                      row.profitCents != null && (row.profitCents >= 0 ? "text-success" : "text-danger"),
                    )}
                  >
                    {row.profitCents == null ? "—" : formatCurrency(row.profitCents)}
                    <span className="block text-xs font-normal text-faint">{pct(row.marginPct)}</span>
                  </Td>
                  <Td className="hidden lg:table-cell">
                    {row.buyerName ?? <span className="text-faint">—</span>}
                    {row.buyerPhone ? <span className="block text-xs text-faint">{row.buyerPhone}</span> : null}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <StoreExpenses
        items={storeExpenses}
        totalCents={fixedCents}
        periodLabel={periodLabel}
        readOnly={!canWrite || context.access !== "full"}
      />
    </>
  );
}
