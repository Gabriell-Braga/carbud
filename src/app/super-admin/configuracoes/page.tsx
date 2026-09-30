import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/shell";
import { Tabs } from "@/components/ui/tabs";
import { requireSuperAdminPage } from "@/lib/auth/guards";
import { asaasEnvironment } from "@/lib/gateway/asaas";
import { getPlatformSettings } from "@/lib/plans/service";
import { emailProvider } from "@/lib/email";
import { getEmailCopyOverrides } from "@/lib/email/copy-store";
import { EmailPanel } from "./email-panel";
import { GatewayStatus } from "./gateway-status";
import { PublicEndpoints } from "./public-endpoints";
import { SettingsForm } from "./settings-form";
import { WebhookHealth } from "./webhook-health";

export const metadata: Metadata = { title: "Configurações da plataforma" };
export const dynamic = "force-dynamic";

/**
 * Três assuntos que não se misturam, e por isso viraram abas.
 *
 * Empilhados, eram duas telas e meia de rolagem: quem vinha ajustar a multa
 * passava por uma tabela de eventos de webhook e por uma lista de endereços
 * que não tinha nada a ver com o que veio fazer. Cada aba responde a uma
 * pergunta: "quanto cobro?", "o gateway está de pé?", "o que preciso
 * recadastrar?".
 */
const TABS = [
  { key: "cobranca", label: "Cobrança" },
  { key: "gateway", label: "Gateway" },
  { key: "email", label: "E-mail" },
  { key: "enderecos", label: "Endereços públicos" },
] as const;

export default async function PlatformSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string }>;
}) {
  const context = await requireSuperAdminPage();
  const { aba } = await searchParams;
  const tab = TABS.some((item) => item.key === aba) ? aba! : "cobranca";

  const settings = await getPlatformSettings();

  // só o ambiente, nunca a chave — o prefixo dela já diz sandbox ou produção
  const environment = process.env.ASAAS_API_KEY ? asaasEnvironment() : null;

  return (
    <>
      <PageHeader
        title="Configurações da plataforma"
        description="Cobrança, saúde do gateway, e-mails do produto e os endereços que outros serviços chamam."
      />

      <Tabs
        active={tab}
        items={TABS.map((item) => ({
          key: item.key,
          label: item.label,
          href: `/super-admin/configuracoes?aba=${item.key}`,
        }))}
      />

      {tab === "cobranca" ? <SettingsForm settings={settings} /> : null}

      {tab === "gateway" ? (
        <>
          <GatewayStatus environment={environment} />
          <WebhookHealth />
        </>
      ) : null}

      {tab === "email" ? (
        <EmailPanel
          provider={emailProvider()}
          from={process.env.EMAIL_FROM ?? null}
          defaultTo={context.user.email}
          overrides={await getEmailCopyOverrides()}
        />
      ) : null}

      {tab === "enderecos" ? <PublicEndpoints /> : null}
    </>
  );
}
