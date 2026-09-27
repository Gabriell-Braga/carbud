import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/shell";
import { FeatureLocked } from "@/components/admin/feature-locked";
import { requireTenantPage } from "@/lib/auth/guards";
import { tenantHasFeature } from "@/lib/api/feature-guard";
import { listApiKeys, listTenantWebhooks } from "@/lib/services/api-access";
import { Tabs } from "@/components/ui/tabs";
import { IntegrationsPanel } from "./integrations-panel";

export const metadata: Metadata = { title: "API e webhooks" };
export const dynamic = "force-dynamic";

/**
 * Três assuntos por aba: a chave que abre a porta, o aviso que sai daqui e o
 * feed que os portais leem. Empilhados, eram uma tela e meia de rolagem para
 * quem só queria revogar uma chave.
 */
const TABS = [
  { key: "chaves", label: "Chaves de API" },
  { key: "webhooks", label: "Webhooks" },
  { key: "feed", label: "Feed de estoque" },
] as const;

type Section = (typeof TABS)[number]["key"];

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string }>;
}) {
  const context = await requireTenantPage("api:manage");
  const { aba } = await searchParams;

  if (!(await tenantHasFeature(context.tenant.id, "api_webhooks"))) {
    return (
      <>
        <PageHeader title="API e webhooks" description="Conecte outros sistemas à sua operação." />
        <FeatureLocked
          title="API e webhooks não estão no plano desta revenda"
          description="Eles permitem ler o estoque, receber leads de outros sistemas e ser avisado quando algo acontece aqui."
        />
      </>
    );
  }

  const tab = (TABS.some((item) => item.key === aba) ? aba! : "chaves") as Section;

  const [keys, webhooks, hasClassifieds] = await Promise.all([
    listApiKeys(context.tenant.id),
    listTenantWebhooks(context.tenant.id),
    tenantHasFeature(context.tenant.id, "integracao_classificados"),
  ]);

  return (
    <>
      <PageHeader
        title="API e webhooks"
        description="Chaves para ler seus dados e avisos automáticos quando algo muda."
      />

      <Tabs
        active={tab}
        // o feed só existe para quem tem classificados no plano
        items={TABS.filter((item) => item.key !== "feed" || hasClassifieds).map((item) => ({
          key: item.key,
          label: item.label,
          href: `/admin/integracoes?aba=${item.key}`,
        }))}
      />

      <IntegrationsPanel
        section={tab}
        tenantSlug={context.tenant.slug}
        showFeed={hasClassifieds}
        keys={keys.map((key) => ({
          id: key.id,
          name: key.name,
          prefix: key.prefix,
          lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
          revokedAt: key.revokedAt?.toISOString() ?? null,
          createdAt: key.createdAt.toISOString(),
        }))}
        webhooks={webhooks.map((hook) => ({
          id: hook.id,
          url: hook.url,
          events: hook.events ?? [],
          active: hook.active,
          lastStatus: hook.lastStatus,
          lastError: hook.lastError,
          lastAttemptAt: hook.lastAttemptAt?.toISOString() ?? null,
          failureCount: hook.failureCount,
        }))}
      />
    </>
  );
}
