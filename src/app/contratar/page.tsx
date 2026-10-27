import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { Lock } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { Alert } from "@/components/ui/alert";
import { getDb } from "@/db";
import { plans } from "@/db/schema";
import { PROMO_FIRST_PAYMENT_CENTS, promoNextDueDate } from "@/lib/gateway/references";
import { FEATURES, isFeatureOn } from "@/lib/plans/catalog";
import { turnstileSiteKey } from "@/lib/security/turnstile";
import { CheckoutForm } from "./checkout-form";

export const metadata: Metadata = { title: "Contratar", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Fim do funil da página de planos (Webflow): o botão "Contratar agora" chega
 * aqui com `?plano=<slug>` e a pessoa sai com a revenda criada e logada.
 */
export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ plano?: string; ref?: string }>;
}) {
  const params = await searchParams;
  const db = await getDb();
  const rows = await db
    .select()
    .from(plans)
    .where(and(eq(plans.active, true), eq(plans.publicVisible, true), eq(plans.billingMode, "gateway")))
    .orderBy(asc(plans.sortOrder), asc(plans.name));

  const choices = rows.map((plan) => ({
    id: plan.id,
    slug: plan.slug,
    name: plan.name,
    description: plan.description,
    priceCents: plan.priceCents,
    highlighted: plan.highlighted,
    features: FEATURES.filter((feature) => isFeatureOn(plan.features?.[feature.key])).map(
      (feature) => feature.label,
    ),
  }));
  const initial =
    choices.find((plan) => plan.slug === params.plano?.toLowerCase()) ??
    choices.find((plan) => plan.highlighted) ??
    choices[0];

  return (
    <main className="min-h-screen bg-bg">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          {/* a página de planos mora na mesma origem, fora do mount path do app */}
          <a href="/planos" aria-label="Voltar aos planos">
            <Logo className="h-6" />
          </a>
          <div className="flex items-center gap-4 text-[13px]">
            <span className="hidden items-center gap-1.5 text-muted sm:flex">
              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              Pagamento seguro
            </span>
            <Link href="/login" className="text-accent-text hover:underline">
              Já tenho conta
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
        {initial ? (
          <CheckoutForm
            plans={choices}
            initialPlanId={initial.id}
            affiliateCode={params.ref?.toUpperCase() ?? ""}
            promoCents={PROMO_FIRST_PAYMENT_CENTS}
            firstFullChargeAt={promoNextDueDate().toISOString()}
            captchaSiteKey={turnstileSiteKey()}
          />
        ) : (
          <div className="mx-auto max-w-md">
            <Alert tone="info">
              Nenhum plano disponível para contratação online agora.{" "}
              <a href="/contato" className="underline">
                Fale com a gente
              </a>
              .
            </Alert>
          </div>
        )}
      </div>
    </main>
  );
}
