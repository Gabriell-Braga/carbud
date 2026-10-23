import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/shell";
import { Button } from "@/components/ui/button";
import { BillingStatusBadge, TenantStatusBadge } from "@/components/admin/status-badges";
import { StatCard, StatGrid } from "@/components/admin/stat-card";
import { formatNumber } from "@/lib/utils";
import { getTenantDetail, listBillingEvents } from "@/lib/services/tenants";
import { listTenantUsers } from "@/lib/services/users";
import { getTemplateManifest } from "@carbud/site-kit/manifests";
import { tenantPublicPath } from "@/lib/tenant/resolveTenant";
import { effectiveBillingStatus, getTenantCoreById, graceDaysLeft } from "@/lib/tenant/service";
import { getTenantSubscription, listActivePlanOptions } from "@/lib/services/subscriptions";
import { getTenantAffiliation } from "@/lib/services/affiliates";
import { AffiliationPanel } from "./affiliation-panel";
import { BillingPanel } from "./billing-panel";
import { PaymentsPanel } from "./payments-panel";
import { SubscriptionPanel } from "./subscription-panel";
import { DangerZone } from "./danger-zone";
import { ImpersonateButton } from "./impersonate-button";
import { Tabs } from "@/components/ui/tabs";
import { TenantSettingsForm } from "./tenant-settings";
import { TenantUsersPanel } from "./users-panel";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const detail = await getTenantDetail(id);
  return { title: detail ? detail.tenant.name : "Revenda" };
}

const TABS = [
  { key: "dados", label: "Dados e template" },
  { key: "financeiro", label: "Financeiro" },
  { key: "usuarios", label: "Usuários" },
] as const;

export default async function TenantDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { aba } = await searchParams;
  const tab = TABS.some((item) => item.key === aba) ? aba! : "dados";

  const detail = await getTenantDetail(id);
  if (!detail) notFound();

  const financeiro = tab === "financeiro";
  const [events, users, subscription, planOptions, affiliationRow] = await Promise.all([
    financeiro ? listBillingEvents(id) : Promise.resolve([]),
    tab === "usuarios" ? listTenantUsers(id) : Promise.resolve([]),
    financeiro ? getTenantSubscription(id) : Promise.resolve(null),
    financeiro ? listActivePlanOptions() : Promise.resolve([]),
    financeiro ? getTenantAffiliation(id) : Promise.resolve(null),
  ]);
  const affiliation = affiliationRow
    ? {
        affiliateId: affiliationRow.affiliate.id,
        affiliateName: affiliationRow.affiliate.name,
        code: affiliationRow.affiliation.codeSnapshot,
        commissionBps: affiliationRow.affiliation.commissionBpsSnapshot,
        attributedAt: affiliationRow.affiliation.attributedAt.toISOString(),
        source: affiliationRow.affiliation.source,
      }
    : null;

  const template = getTemplateManifest(detail.tenant.templateId);
  const core = await getTenantCoreById(id);

  return (
    <>
      <PageHeader
        title={detail.tenant.name}
        description={`/r/${detail.tenant.slug} · Template ${template.name}`}
        actions={
          <>
            <ImpersonateButton
              tenantId={detail.tenant.id}
              tenantName={detail.tenant.name}
              disabled={detail.tenant.status === "suspended" && detail.tenant.blockMode === "full"}
            />
            <Link href={tenantPublicPath(detail.tenant.slug)} target="_blank">
              <Button variant="secondary">Ver site</Button>
            </Link>
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <TenantStatusBadge status={detail.tenant.status} />
        <BillingStatusBadge status={detail.billing?.status ?? null} />
      </div>

      <StatGrid className="xl:grid-cols-3">
        <StatCard label="Veículos" value={formatNumber(detail.counters.vehicles)} />
        <StatCard label="Leads" value={formatNumber(detail.counters.leads)} />
        <StatCard label="Usuários" value={formatNumber(detail.counters.users)} />
      </StatGrid>

      <Tabs
        active={tab}
        items={TABS.map((item) => ({
          key: item.key,
          label: item.label,
          href: `/super-admin/revendas/${id}?aba=${item.key}`,
        }))}
      />

      {tab === "dados" ? (
        <div className="space-y-6">
          <TenantSettingsForm
            tenant={{
              id: detail.tenant.id,
              name: detail.tenant.name,
              slug: detail.tenant.slug,
              legalName: detail.tenant.legalName,
              cnpj: detail.tenant.cnpj,
              status: detail.tenant.status === "suspended" ? "suspended" : "active",
              templateId: detail.tenant.templateId,
              blockMode: detail.tenant.blockMode,
              notes: detail.tenant.notes,
              gtmCode: detail.tenant.gtmCode ?? null,
            }}
          />
          <DangerZone tenantId={detail.tenant.id} tenantName={detail.tenant.name} />
        </div>
      ) : null}

      {tab === "financeiro" ? (
        <SubscriptionPanel
          tenantId={id}
          affiliateCode={affiliation?.code ?? null}
          hasCnpj={Boolean(detail.tenant.cnpj)}
          planName={subscription?.planName ?? null}
          plans={planOptions}
          subscription={subscription?.summary ?? null}
          billedCents={detail.billing?.amountCents ?? null}
        />
      ) : null}

      {financeiro ? <AffiliationPanel tenantId={id} affiliation={affiliation} /> : null}

      {financeiro && subscription?.summary?.gatewaySubscriptionId ? (
        <PaymentsPanel tenantId={id} />
      ) : null}

      {tab === "financeiro" ? (
        <BillingPanel
          tenantId={id}
          billing={
            detail.billing
              ? {
                  status: detail.billing.status,
                  dueDay: detail.billing.dueDay,
                  graceDays: detail.billing.graceDays,
                  amountCents: detail.billing.amountCents,
                  currentDueDate: detail.billing.currentDueDate?.toISOString() ?? null,
                  lastPaymentAt: detail.billing.lastPaymentAt?.toISOString() ?? null,
                }
              : null
          }
          effectiveStatus={core ? effectiveBillingStatus(core) : "adimplente"}
          graceDaysLeft={core ? graceDaysLeft(core) : null}
          events={events.map((item) => ({
            id: item.id,
            type: item.type,
            amountCents: item.amountCents,
            referenceMonth: item.referenceMonth,
            statusFrom: item.statusFrom,
            statusTo: item.statusTo,
            note: item.note,
            createdByEmail: item.createdByEmail,
            createdAt: item.createdAt.toISOString(),
          }))}
        />
      ) : null}

      {tab === "usuarios" ? (
        <TenantUsersPanel
          tenantId={id}
          users={users.map((user) => ({
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            status: user.status,
            mustChangePassword: user.mustChangePassword,
            lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
          }))}
        />
      ) : null}
    </>
  );
}
