import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/layout/shell";
import { Pagination } from "@/components/admin/pagination";
import { StatCard, StatGrid } from "@/components/admin/stat-card";
import { VehicleStatusBadge } from "@/components/admin/status-badges";
import { VehicleThumb } from "@/components/admin/vehicle-thumb";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/field";
import { EmptyState, Table, Td, Th, Thead, Tr } from "@/components/ui/table";
import { VEHICLE_STATUS, type VehicleStatus } from "@/db/schema";
import { formatPlate } from "@/lib/format/plate";
import { requireTenantPage } from "@/lib/auth/guards";
import { can } from "@/lib/auth/rbac";
import { VEHICLE_STATUS_LABELS } from "@/lib/catalog/labels";
import { getVehicleStats, listVehicles } from "@/lib/services/vehicles";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Estoque" };
export const dynamic = "force-dynamic";

export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; sort?: string; page?: string }>;
}) {
  const context = await requireTenantPage("vehicles:read");
  const params = await searchParams;

  const status = VEHICLE_STATUS.includes(params.status as VehicleStatus)
    ? (params.status as VehicleStatus)
    : undefined;

  const [stats, result] = await Promise.all([
    getVehicleStats(context.tenant.id),
    listVehicles(context.tenant.id, {
      search: params.q?.trim() || undefined,
      status,
      sort: (params.sort as "recentes") || "recentes",
      page: Number(params.page ?? 1) || 1,
      pageSize: 20,
    }),
  ]);

  const canWrite = can(context.role, "vehicles:write") && context.access === "full";

  return (
    <>
      <PageHeader
        title="Estoque"
        description={`${formatNumber(result.total)} veículo(s) no filtro atual.`}
        actions={
          canWrite ? (
            <Link href="/admin/estoque/novo">
              <Button>Novo veículo</Button>
            </Link>
          ) : null
        }
      />

      <StatGrid>
        <StatCard label="Disponíveis" value={formatNumber(stats.available)} tone="success" />
        <StatCard label="Reservados" value={formatNumber(stats.reserved)} tone="warning" />
        <StatCard label="Vendidos" value={formatNumber(stats.sold)} />
        <StatCard label="Rascunhos" value={formatNumber(stats.draft)} hint="Fora do site" />
        <StatCard label="Em destaque" value={formatNumber(stats.featured)} hint="Na home" />
      </StatGrid>

      <Card className="mb-3">
        {/*
          No celular os campos formam uma grade de duas colunas, com a busca
          e o botão atravessando as duas. Empilhados um por linha, os filtros
          ocupavam uma tela inteira antes do primeiro carro aparecer.
        */}
        <Form
          className="grid grid-cols-2 items-end gap-3 px-4 py-3.5 sm:flex sm:flex-wrap"
          action="/admin/estoque"
        >
          <div className="col-span-2 sm:min-w-56 sm:flex-1">
            <Label htmlFor="q">Buscar</Label>
            <Input
              id="q"
              name="q"
              defaultValue={params.q ?? ""}
              placeholder="Marca, modelo ou versão"
            />
          </div>
          <div className="min-w-0">
            <Label htmlFor="status">Situação</Label>
            <Select id="status" name="status" defaultValue={status ?? ""} className="w-full sm:w-40">
              <option value="">Todas</option>
              {VEHICLE_STATUS.map((value) => (
                <option key={value} value={value}>
                  {VEHICLE_STATUS_LABELS[value]}
                </option>
              ))}
            </Select>
          </div>
          <div className="min-w-0">
            <Label htmlFor="sort">Ordenar por</Label>
            <Select
              id="sort"
              name="sort"
              defaultValue={params.sort ?? "recentes"}
              className="w-full sm:w-44"
            >
              <option value="recentes">Mais recentes</option>
              <option value="preco-asc">Menor preço</option>
              <option value="preco-desc">Maior preço</option>
              <option value="km-asc">Menor km</option>
              <option value="ano-desc">Ano mais novo</option>
            </Select>
          </div>
          <Button type="submit" variant="secondary" className="col-span-2 sm:col-span-1">
            Filtrar
          </Button>
        </Form>
      </Card>

      {/*
        No celular a tabela cabe na tela sem rolar: só ficam a coluna do
        veículo e a ação, e o que estava nas outras colunas (ano, km, preço,
        situação) entra numa linha embaixo do nome. O `md:` das colunas e do
        resumo é o mesmo ponto de corte, de propósito — ou a informação está
        numa coluna, ou está no resumo, nunca nos dois.
      */}
      <Card>
        {result.items.length === 0 ? (
          <EmptyState
            title="Nenhum veículo encontrado"
            description="Ajuste os filtros ou cadastre um veículo para ele aparecer no site."
            action={
              canWrite ? (
                <Link href="/admin/estoque/novo">
                  <Button size="sm">Cadastrar veículo</Button>
                </Link>
              ) : null
            }
          />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Veículo</Th>
                <Th numeric className="hidden md:table-cell">
                  Ano
                </Th>
                <Th numeric className="hidden md:table-cell">
                  KM
                </Th>
                <Th numeric className="hidden md:table-cell">
                  Preço
                </Th>
                <Th className="hidden md:table-cell">Situação</Th>
                <Th numeric className="hidden md:table-cell">
                  Fotos
                </Th>
                <Th />
              </Tr>
            </Thead>
            <tbody>
              {result.items.map((vehicle) => {
                const price = vehicle.priceOnRequest ? (
                  <span className="text-muted">Sob consulta</span>
                ) : (
                  formatCurrency(vehicle.priceCents)
                );

                return (
                  <Tr key={vehicle.id}>
                    <Td className="w-full md:w-auto">
                      <div className="flex items-center gap-2.5">
                        <VehicleThumb
                          photoKey={vehicle.coverPhotoKey}
                          alt={`${vehicle.brand} ${vehicle.model}`}
                        />
                        <div className="min-w-0">
                          <Link
                            href={`/admin/estoque/${vehicle.id}`}
                            className="font-medium text-text transition-colors hover:text-accent-text"
                          >
                            {vehicle.brand} {vehicle.model}
                          </Link>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            {vehicle.version ? (
                              <p className="truncate text-xs text-faint">{vehicle.version}</p>
                            ) : null}
                            {/*
                              A placa entra aqui porque e o que separa dois
                              carros iguais no patio — mesmo modelo, mesmo ano,
                              mesma cor. Em fonte de codigo, para nao competir
                              com o nome do veiculo.
                            */}
                            {vehicle.licensePlate ? (
                              <p className="whitespace-nowrap font-mono text-xs text-faint">
                                {formatPlate(vehicle.licensePlate)}
                              </p>
                            ) : null}
                            {vehicle.featured ? <Badge tone="info">Destaque</Badge> : null}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs md:hidden">
                            <span className="tnum font-medium text-text">{price}</span>
                            <span className="tnum text-muted">
                              {vehicle.yearManufacture}/{vehicle.yearModel}
                            </span>
                            <span className="tnum text-muted">
                              {formatNumber(vehicle.mileageKm)} km
                            </span>
                            <VehicleStatusBadge status={vehicle.status} />
                            {vehicle.photosCount === 0 ? (
                              <span className="text-danger">Sem fotos</span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </Td>
                    <Td numeric className="hidden whitespace-nowrap text-muted md:table-cell">
                      {vehicle.yearManufacture}/{vehicle.yearModel}
                    </Td>
                    <Td numeric className="hidden text-muted md:table-cell">
                      {formatNumber(vehicle.mileageKm)}
                    </Td>
                    <Td numeric className="hidden whitespace-nowrap font-medium md:table-cell">
                      {price}
                    </Td>
                    <Td className="hidden md:table-cell">
                      <VehicleStatusBadge status={vehicle.status} />
                    </Td>
                    <Td
                      numeric
                      className={cn(
                        "hidden md:table-cell",
                        vehicle.photosCount === 0 ? "text-danger" : "text-muted",
                      )}
                    >
                      {vehicle.photosCount}
                    </Td>
                    <Td className="pl-0 text-right md:pl-4">
                      {/* no celular a ação vira só a seta: o botão com texto
                          roubava a largura que o resumo precisa */}
                      <Link
                        href={`/admin/estoque/${vehicle.id}`}
                        aria-label={canWrite ? "Editar veículo" : "Ver veículo"}
                        className="grid h-8 w-8 place-items-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-text md:hidden"
                      >
                        <ChevronRight className="h-4 w-4" aria-hidden="true" />
                      </Link>
                      <Link href={`/admin/estoque/${vehicle.id}`} className="hidden md:inline-flex">
                        <Button size="sm" variant="secondary">
                          {canWrite ? "Editar" : "Ver"}
                        </Button>
                      </Link>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <Pagination
        basePath="/admin/estoque"
        page={result.page}
        total={result.total}
        pageSize={result.pageSize}
        params={{ q: params.q, status, sort: params.sort }}
      />
    </>
  );
}
