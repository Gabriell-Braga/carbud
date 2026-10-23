import type { Metadata } from "next";
import { and, asc, eq } from "drizzle-orm";
import { PageHeader } from "@/components/layout/shell";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db";
import { plans, tenantSites, tenants } from "@/db/schema";
import { requireTenantPage } from "@/lib/auth/guards";
import { PROMO_FIRST_PAYMENT_CENTS, promoNextDueDate } from "@/lib/gateway/references";
import { getTenantAffiliation } from "@/lib/services/affiliates";
import { getTenantSubscription } from "@/lib/services/subscriptions";
import { formatCurrency, formatDate, onlyDigits } from "@/lib/utils";
import { CardSignupForm } from "./card-signup-form";

export const metadata: Metadata = { title: "Assinatura" };
export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  trialing: "Em teste",
  active: "Ativa",
  past_due: "Em atraso",
  canceled: "Cancelada",
  manual: "Negociada",
};

export default async function SubscriptionPage() {
  const context = await requireTenantPage("tenant:settings");
  const tenantId = context.tenant.id;
  const db = await getDb();

  const [subscription, planRows, tenantRows, affiliation] = await Promise.all([
    getTenantSubscription(tenantId),
    db
      .select({ id: plans.id, name: plans.name, description: plans.description, priceCents: plans.priceCents, highlighted: plans.highlighted })
      .from(plans)
      .where(and(eq(plans.active, true), eq(plans.publicVisible, true), eq(plans.billingMode, "gateway")))
      .orderBy(asc(plans.sortOrder), asc(plans.name)),
    db
      .select({ tenant: tenants, site: tenantSites })
      .from(tenants)
      .leftJoin(tenantSites, eq(tenantSites.tenantId, tenants.id))
      .where(eq(tenants.id, tenantId))
      .limit(1),
    getTenantAffiliation(tenantId),
  ]);

  const summary = subscription?.summary;
  const contracted =
    summary && (summary.gatewaySubscriptionId || summary.status === "manual") && summary.status !== "canceled";
  const row = tenantRows[0];

  return (
    <>
      <PageHeader title="Assinatura" description="Seu plano e a forma de pagamento." />

      {contracted ? (
        <Card>
          <CardHeader>
            <CardTitle>{subscription?.planName ?? "Plano"}</CardTitle>
            <CardDescription>
              {summary.billingType === "CREDIT_CARD"
                ? "Cobrado automaticamente no cartão cadastrado."
                : "A cobrança chega por e-mail a cada vencimento."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-4 text-[13px]">
            <Badge tone={summary.status === "past_due" ? "warning" : "success"}>
              {STATUS_LABELS[summary.status] ?? summary.status}
            </Badge>
            <span className="text-muted">
              {formatCurrency(summary.priceCents)} por ciclo
              {summary.currentPeriodEnd
                ? ` · próxima cobrança em ${formatDate(new Date(summary.currentPeriodEnd))}`
                : ""}
            </span>
          </CardContent>
        </Card>
      ) : planRows.length === 0 ? (
        <Alert tone="info">
          Nenhum plano disponível para contratação online agora. Fale com o suporte.
        </Alert>
      ) : !onlyDigits(row?.tenant.cnpj ?? "") ? (
        <Alert tone="warning">
          Falta o CNPJ da revenda no cadastro, e o meio de pagamento exige. Fale com o suporte para
          completar.
        </Alert>
      ) : (
        <CardSignupForm
          plans={planRows}
          promoCents={PROMO_FIRST_PAYMENT_CENTS}
          firstFullChargeAt={promoNextDueDate().toISOString()}
          hasAffiliation={Boolean(affiliation)}
          defaults={{
            name: row?.tenant.legalName || row?.tenant.name || "",
            email: row?.site?.email ?? "",
            cpfCnpj: row?.tenant.cnpj ?? "",
            postalCode: row?.site?.addressZip ?? "",
            addressNumber: row?.site?.addressNumber ?? "",
            phone: row?.site?.whatsapp ?? row?.site?.phone ?? "",
          }}
        />
      )}
    </>
  );
}
