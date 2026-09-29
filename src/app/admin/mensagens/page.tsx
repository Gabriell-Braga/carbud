import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/shell";
import { requireTenantPage } from "@/lib/auth/guards";
import { can } from "@/lib/auth/rbac";
import { ensureTemplates } from "@/lib/services/message-templates";
import { getWhatsappConnection } from "@/lib/services/whatsapp";
import { tenantHasFeature } from "@/lib/api/feature-guard";
import { isEmailConfigured } from "@/lib/email";
import { isVaultConfigured } from "@/lib/security/vault";
import { getNotificationSettings, teamEmails } from "@/lib/services/notifications";
import { Tabs } from "@/components/ui/tabs";
import { NotificationsPanel } from "./notifications-panel";
import { TemplatesPanel } from "./templates-panel";
import { WhatsappConnection } from "./whatsapp-connection";

export const metadata: Metadata = { title: "Mensagens" };
export const dynamic = "force-dynamic";

/**
 * Três coisas diferentes: os textos que a equipe manda, a conta de WhatsApp
 * conectada e os avisos que o sistema manda sozinho. Quem vem escrever um
 * modelo não precisa passar pela ficha da conexão.
 */
const TABS = [
  { key: "modelos", label: "Modelos" },
  { key: "avisos", label: "Avisos por e-mail" },
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

  const canWrite = can(context.role, "tenant:settings");

  const [templates, connection, hasWhatsapp, notifications, team] = await Promise.all([
    ensureTemplates(context.tenant.id),
    getWhatsappConnection(context.tenant.id),
    tenantHasFeature(context.tenant.id, "whatsapp_integrado"),
    getNotificationSettings(context.tenant.id),
    teamEmails(context.tenant.id),
  ]);

  return (
    <>
      <PageHeader
        title="Mensagens"
        description="O que a equipe manda pelo WhatsApp e o que o sistema avisa por e-mail."
      />

      <Tabs
        active={tab}
        // sem WhatsApp no plano não há o que conectar: a aba não aparece
        items={TABS.filter((item) => item.key !== "conexao" || hasWhatsapp).map((item) => ({
          key: item.key,
          label: item.label,
          href: `/admin/mensagens?aba=${item.key}`,
        }))}
      />

      {tab === "avisos" ? (
        <NotificationsPanel
          readOnly={!canWrite}
          emailReady={isEmailConfigured()}
          suggestions={team}
          initial={{
            newLead: notifications.newLead ?? false,
            notifyAssignee: notifications.notifyAssignee ?? true,
            leadRecipients: notifications.leadRecipients ?? [],
          }}
        />
      ) : null}

      {hasWhatsapp && tab === "conexao" ? (
        <WhatsappConnection
          vaultReady={isVaultConfigured()}
          canWrite={canWrite}
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
          canWrite={canWrite}
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
