import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/shell";
import { requireTenantPage } from "@/lib/auth/guards";
import { can } from "@/lib/auth/rbac";
import { ensureTemplates } from "@/lib/services/message-templates";
import { getWhatsappConnection } from "@/lib/services/whatsapp";
import { tenantHasFeature } from "@/lib/api/feature-guard";
import { isVaultConfigured } from "@/lib/security/vault";
import { Tabs } from "@/components/ui/tabs";
import { TemplatesPanel } from "./templates-panel";
import { WhatsappConnection } from "./whatsapp-connection";

export const metadata: Metadata = { title: "Mensagens" };
export const dynamic = "force-dynamic";

/**
 * Duas coisas diferentes: a conta conectada e os textos que ela manda.
 * Quem vem escrever um modelo não precisa passar pela ficha da conexão.
 */
const TABS = [
  { key: "modelos", label: "Modelos" },
  { key: "conexao", label: "Conexão" },
] as const;

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string }>;
}) {
  const context = await requireTenantPage("leads:read");
  const { aba } = await searchParams;
  const tab = TABS.some((item) => item.key === aba) ? aba! : "modelos";

  const [templates, connection, hasWhatsapp] = await Promise.all([
    ensureTemplates(context.tenant.id),
    getWhatsappConnection(context.tenant.id),
    tenantHasFeature(context.tenant.id, "whatsapp_integrado"),
  ]);

  return (
    <>
      <PageHeader
        title="Mensagens"
        description="Modelos prontos para o WhatsApp. O vendedor escolhe na ficha do lead e o sistema preenche os dados."
      />

      {/* sem WhatsApp no plano não há o que conectar: a aba não aparece */}
      {hasWhatsapp ? (
        <Tabs
          active={tab}
          items={TABS.map((item) => ({
            key: item.key,
            label: item.label,
            href: `/admin/mensagens?aba=${item.key}`,
          }))}
        />
      ) : null}

      {hasWhatsapp && tab === "conexao" ? (
        <WhatsappConnection
          vaultReady={isVaultConfigured()}
          canWrite={can(context.role, "tenant:settings")}
          connection={
            connection
              ? {
                  phoneNumberId: connection.phoneNumberId,
                  wabaId: connection.wabaId,
                  displayPhone: connection.displayPhone,
                  status: connection.status,
                  lastError: connection.lastError,
                  lastInboundAt: connection.lastInboundAt?.toISOString() ?? null,
                }
              : null
          }
        />
      ) : null}

      {tab === "modelos" ? (
        <TemplatesPanel
          templates={templates.map((template) => ({
            id: template.id,
            name: template.name,
            body: template.body,
            active: template.active,
          }))}
          canWrite={can(context.role, "tenant:settings")}
          example={{
            nome: "Ana Paula Ribeiro",
            veiculo: "Chevrolet Onix 1.0 LT 2022",
            preco: "R$ 79.900,00",
            vendedor: context.user.name,
            revenda: context.tenant.name,
          }}
        />
      ) : null}
    </>
  );
}
