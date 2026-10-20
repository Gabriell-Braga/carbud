import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, Palette } from "lucide-react";
import { PageHeader } from "@/components/layout/shell";
import { StatCard, StatGrid } from "@/components/admin/stat-card";
import { LeadStatusBadge } from "@/components/admin/status-badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, Table, Td, Th, Thead, Tr } from "@/components/ui/table";
import { requireTenantPage } from "@/lib/auth/guards";
import { can } from "@/lib/auth/rbac";
import { listLeads } from "@/lib/services/leads";
import { getVehicleStats } from "@/lib/services/vehicles";
import { publicSiteUrl } from "@/lib/services/domains";
import { tenantAbsoluteUrl } from "@/lib/seo/urls";
import { formatDateTime, formatNumber, formatPhone } from "@/lib/utils";

export const metadata: Metadata = { title: "Painel da revenda" };
export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const context = await requireTenantPage();

  const [stats, leads] = await Promise.all([
    can(context.role, "vehicles:read") ? getVehicleStats(context.tenant.id) : null,
    can(context.role, "leads:read")
      ? listLeads(context.tenant.id, { pageSize: 5 })
      : null,
  ]);

  /*
   * O endereco que a revenda divulga e o dominio dela, quando existe.
   *
   * Mostrar "/r/gabriel-braga-andrade-ltda" para uma loja que ja tem
   * seminovos.gabrielbraga.app no ar nao ajuda ninguem: e um caminho interno
   * que ela nunca vai passar para um cliente.
   */
  const siteUrl = await publicSiteUrl(context.tenant.id);
  // absoluto, com o /app: é texto para copiar, e o caminho cru dava 404
  const previewUrl = await tenantAbsoluteUrl(context.tenant.slug);
  const enderecoVisivel = siteUrl ?? previewUrl;

  return (
    <>
      <PageHeader
        title="Visão geral"
        description="Estoque e contatos recebidos pelo site da revenda."
        actions={
          <>
            <Link href={enderecoVisivel} target="_blank">
              <Button variant="secondary">
                Ver meu site
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            </Link>
            {can(context.role, "site:read") ? (
              <Link href="/admin/site">
                <Button>
                  <Palette className="h-3.5 w-3.5" />
                  Configurar site
                </Button>
              </Link>
            ) : null}
          </>
        }
      />

      {stats ? (
        <StatGrid>
          <StatCard
            label="Disponíveis"
            value={formatNumber(stats.available)}
            tone="success"
            hint="No ar agora"
          />
          <StatCard label="Reservados" value={formatNumber(stats.reserved)} tone="warning" />
          <StatCard label="Vendidos" value={formatNumber(stats.sold)} />
          <StatCard
            label="Rascunhos"
            value={formatNumber(stats.draft)}
            hint="Ainda fora do site"
          />
          <StatCard label="Em destaque" value={formatNumber(stats.featured)} hint="Na home" />
        </StatGrid>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        {leads ? (
          <Card>
            <CardHeader className="flex items-center justify-between gap-3">
              <CardTitle>Últimos contatos</CardTitle>
              <Link
                href="/admin/leads"
                className="label-instrument text-muted transition-colors hover:text-text"
              >
                Ver todos
              </Link>
            </CardHeader>

            {leads.items.length === 0 ? (
              <EmptyState
                title="Nenhum contato ainda"
                description="Os leads enviados pelo formulário do seu site aparecem aqui."
              />
            ) : (
              <Table>
                <Thead>
                  <Tr>
                    <Th>Cliente</Th>
                    <Th>Interesse</Th>
                    <Th>Situação</Th>
                    <Th numeric>Recebido</Th>
                  </Tr>
                </Thead>
                <tbody>
                  {leads.items.map((lead) => (
                    <Tr key={lead.id}>
                      <Td>
                        <p className="font-medium text-text">{lead.name}</p>
                        <p className="text-xs text-faint">{formatPhone(lead.phone)}</p>
                      </Td>
                      <Td className="max-w-56 truncate text-muted">
                        {lead.vehicleLabel ?? "Contato geral"}
                      </Td>
                      <Td>
                        <LeadStatusBadge status={lead.status} />
                      </Td>
                      <Td numeric className="whitespace-nowrap text-muted">
                        {formatDateTime(lead.createdAt)}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Endereço do site</CardTitle>
          </CardHeader>
          <CardContent>
            <code className="block break-all rounded border border-border bg-surface-2 px-2.5 py-2 text-xs text-text">
              {enderecoVisivel}
            </code>
            {/*
              O caminho interno continua a vista quando ha dominio proprio: ele
              responde mesmo se o DNS do cliente sair do ar, e e por onde a
              equipe confere o site sem depender da configuracao dele.
            */}
            {siteUrl ? (
              <p className="mt-2 text-xs text-faint">
                Também responde por <span className="font-mono">{previewUrl}</span>
              </p>
            ) : null}
            <p className="mt-3 text-[13px] leading-relaxed text-muted">
              Somente veículos <strong className="font-medium text-text">disponíveis</strong> e{" "}
              <strong className="font-medium text-text">reservados</strong> aparecem no site.
              Rascunhos ficam visíveis apenas aqui.
            </p>
            {can(context.role, "site:read") ? (
              <Link href="/admin/site" className="mt-4 inline-block">
                <Button variant="secondary">
                  <Palette className="h-3.5 w-3.5" />
                  Configurar o site
                </Button>
              </Link>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
