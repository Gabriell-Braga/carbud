import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { PageHeader } from "@/components/layout/shell";
import { Pagination } from "@/components/admin/pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/field";
import { EmptyState, Table, Td, Th, Thead, Tr } from "@/components/ui/table";
import { listAuditActions, listAuditLog } from "@/lib/services/audit";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Auditoria" };
export const dynamic = "force-dynamic";

/**
 * Nome de cada ação em português.
 *
 * A auditoria é lida por gente, não por quem escreveu o código: "auth.login"
 * e "portal.connect" só fazem sentido para quem conhece a chave. Ação sem
 * tradução aqui aparece crua na tela, então toda ação nova precisa de uma
 * linha — é o preço de a tela ser legível.
 */
const ACTION_LABELS: Record<string, string> = {
  // acesso
  "auth.login": "Entrou no sistema",
  "auth.logout": "Saiu do sistema",
  "auth.change_password": "Senha alterada",
  "auth.forgot_password": "Recuperação de senha pedida",
  "auth.reset_password": "Senha recuperada por link",
  "platform.impersonate.start": "Entrou na revenda",
  "platform.impersonate.stop": "Saiu da revenda",

  // plataforma
  "platform.bootstrap": "Plataforma iniciada",
  "platform.user.create": "Super-admin criado",
  "platform.settings.update": "Configurações da plataforma alteradas",

  // revendas
  "tenant.create": "Revenda criada",
  "tenant.update": "Revenda atualizada",
  "tenant.delete": "Revenda excluída",
  "tenant.user.create": "Usuário da revenda criado",

  // pessoas
  "user.create": "Usuário criado",
  "user.update": "Usuário atualizado",
  "user.reset_password": "Senha redefinida",

  // cobrança
  "billing.update": "Financeiro atualizado",
  "billing.payment": "Pagamento registrado",
  "billing.auto_status": "Situação alterada pela régua de cobrança",
  "billing.gateway_event": "Aviso do gateway processado",
  "billing.subscription.create": "Plano contratado",
  "billing.subscription.cancel": "Assinatura cancelada",
  "billing.payment.receive_in_cash": "Baixa manual de pagamento",
  "gateway.webhook.resume": "Fila do gateway religada",

  // planos
  "plan.create": "Plano criado",
  "plan.update": "Plano atualizado",
  "plan.delete": "Plano excluído",
  "coupon.create": "Cupom criado",
  "coupon.update": "Cupom atualizado",
  "coupon.delete": "Cupom excluído",
  "coupon.deactivate": "Cupom desativado",

  // estoque
  "vehicle.create": "Veículo cadastrado",
  "vehicle.update": "Veículo atualizado",
  "vehicle.delete": "Veículo excluído",
  "vehicle.photo.upload": "Foto enviada",
  "vehicle.photo.delete": "Foto removida",

  // comercial
  "lead.update": "Lead atualizado",
  "lead.routing.update": "Distribuição de leads alterada",
  "stage.create": "Etapa do funil criada",
  "stage.update": "Etapa do funil atualizada",
  "stage.delete": "Etapa do funil excluída",
  "financing.create": "Financiamento registrado",
  "financing.update": "Financiamento atualizado",
  "financing.delete": "Financiamento excluído",
  "appraisal.create": "Avaliação registrada",
  "appraisal.update": "Avaliação atualizada",
  "appraisal.delete": "Avaliação excluída",
  "appraisal.to_vehicle": "Avaliação virou ficha no estoque",
  "domain.add": "Endereço do site cadastrado",
  "domain.primary": "Endereço oficial do site alterado",
  "domain.remove": "Endereço do site removido",
  "template.create": "Modelo de mensagem criado",
  "template.update": "Modelo de mensagem atualizado",
  "template.delete": "Modelo de mensagem excluído",

  // site e unidades
  "site.update": "Site atualizado",
  "site.logo.update": "Logo atualizada",
  "site.logo.delete": "Logo removida",
  "site.banner.create": "Banner criado",
  "site.banner.update": "Banner atualizado",
  "site.banner.delete": "Banner removido",
  "store.create": "Unidade criada",
  "store.update": "Unidade atualizada",
  "store.delete": "Unidade excluída",

  // integrações
  "api_key.create": "Chave de API criada",
  "api_key.revoke": "Chave de API revogada",
  "webhook.create": "Webhook criado",
  "webhook.update": "Webhook atualizado",
  "webhook.delete": "Webhook removido",
  "portal.connect": "Portal conectado",
  "portal.settings": "Ajustes do portal alterados",
  "portal.disconnect": "Portal desconectado",
  "whatsapp.connect": "WhatsApp conectado",
  "whatsapp.disconnect": "WhatsApp desconectado",
};

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; action?: string; page?: string }>;
}) {
  const params = await searchParams;
  const [result, actions] = await Promise.all([
    listAuditLog({
      search: params.q?.trim() || undefined,
      action: params.action || undefined,
      page: Number(params.page ?? 1) || 1,
    }),
    listAuditActions(),
  ]);

  return (
    <>
      <PageHeader
        title="Auditoria"
        description={`${result.total} registro(s). Toda ação sensível da plataforma passa por aqui.`}
      />

      <Card className="mb-3">
        <Form className="flex flex-wrap items-end gap-3 px-4 py-3.5" action="/super-admin/auditoria">
          <div className="min-w-56 flex-1">
            <Label htmlFor="q">Responsável ou ação</Label>
            <Input id="q" name="q" defaultValue={params.q ?? ""} placeholder="admin@…" />
          </div>
          <div>
            <Label htmlFor="action">Ação</Label>
            <Select id="action" name="action" defaultValue={params.action ?? ""} className="w-56">
              <option value="">Todas</option>
              {actions.map((action) => (
                <option key={action} value={action}>
                  {ACTION_LABELS[action] ?? action}
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
          <EmptyState title="Nenhum registro" description="Ainda não há ações registradas." />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th numeric>Quando</Th>
                <Th>Ação</Th>
                <Th>Responsável</Th>
                <Th>Revenda</Th>
                <Th>Detalhes</Th>
              </Tr>
            </Thead>
            <tbody>
              {result.items.map((item) => (
                <Tr key={item.id}>
                  <Td numeric className="whitespace-nowrap text-muted">
                    {formatDateTime(item.createdAt)}
                  </Td>
                  <Td>
                    <span className="text-text">{ACTION_LABELS[item.action] ?? item.action}</span>
                    {item.impersonated ? (
                      <Badge tone="warning" className="ml-2">
                        em nome da revenda
                      </Badge>
                    ) : null}
                  </Td>
                  <Td className="text-muted">{item.actorEmail ?? "—"}</Td>
                  <Td>
                    {item.tenantId ? (
                      <Link
                        href={`/super-admin/revendas/${item.tenantId}`}
                        className="text-muted transition-colors hover:text-accent-text"
                      >
                        {item.tenantName ?? "—"}
                      </Link>
                    ) : (
                      <span className="text-faint">Plataforma</span>
                    )}
                  </Td>
                  <Td className="max-w-80 truncate text-xs text-faint">
                    {item.metadata ? JSON.stringify(item.metadata) : "—"}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Pagination
        basePath="/super-admin/auditoria"
        page={result.page}
        total={result.total}
        pageSize={result.pageSize}
        params={{ q: params.q, action: params.action }}
      />
    </>
  );
}
