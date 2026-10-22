import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadPublicSite, PUBLIC_VEHICLE_STATUSES } from "@/lib/services/public-site";
import { toVehicleCards, toVehicleDetail } from "@/lib/services/site";
import { getVehicleBySlug, listVehicles } from "@/lib/services/vehicles";
import { JsonLd, breadcrumbJsonLd, vehicleJsonLd } from "@/lib/seo/jsonld";
import { tenantAbsoluteUrl } from "@/lib/seo/urls";
import { LeadForm } from "@carbud/site-kit/shared/lead-form";
import { FinancingEstimator } from "@carbud/site-kit/shared/financing-form";
import { SellCarTeaser } from "@carbud/site-kit/shared/sell-car-form";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string; vehicleSlug: string }>;
};

const PUBLIC = [...PUBLIC_VEHICLE_STATUSES] as string[];

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, vehicleSlug } = await params;
  const context = await loadPublicSite(slug);
  const found = await getVehicleBySlug(context.tenantId, vehicleSlug);

  if (!found || !PUBLIC.includes(found.vehicle.status)) {
    return { title: "Veículo não encontrado", robots: { index: false, follow: false } };
  }

  const vehicle = toVehicleDetail(found.vehicle, found.photos);
  const title = `${vehicle.title} ${vehicle.yearLabel}`;
  const description = `${title} com ${vehicle.mileageLabel} por ${vehicle.priceLabel} na ${context.site.name}.`;
  const url = await tenantAbsoluteUrl(slug, `/veiculo/${vehicle.slug}`);
  const image = vehicle.photos[0]?.full ?? vehicle.coverUrl;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: "website",
      locale: "pt_BR",
      siteName: context.site.name,
      images: image ? [{ url: image, alt: title }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function VehicleDetailPage({ params }: Props) {
  const { slug, vehicleSlug } = await params;

  const context = await loadPublicSite(slug);
  const found = await getVehicleBySlug(context.tenantId, vehicleSlug);
  if (!found || !PUBLIC.includes(found.vehicle.status)) notFound();

  const vehicle = toVehicleDetail(found.vehicle, found.photos);

  const [related, vehicleUrl, homeUrl, stockUrl] = await Promise.all([
    listVehicles(context.tenantId, {
      statuses: [...PUBLIC_VEHICLE_STATUSES],
      brand: found.vehicle.brand,
      pageSize: 5,
    }),
    tenantAbsoluteUrl(slug, `/veiculo/${vehicle.slug}`),
    tenantAbsoluteUrl(slug),
    tenantAbsoluteUrl(slug, "/estoque"),
  ]);

  const Detail = context.template.VehicleDetail;
  const tone = context.templateId === "template-2-dark" ? "dark" : "light";

  return (
    <>
      <JsonLd data={vehicleJsonLd(vehicle, context.site, vehicleUrl)} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Início", url: homeUrl },
          { name: "Estoque", url: stockUrl },
          { name: vehicle.title, url: vehicleUrl },
        ])}
      />
      <Detail
        site={context.site}
        links={context.links}
        vehicle={vehicle}
        related={await toVehicleCards(related.items.filter((item) => item.id !== found.vehicle.id).slice(0, 4))}
        leadForm={
          <LeadForm
            tenantSlug={slug}
            vehicleId={vehicle.id}
            vehicleLabel={`${vehicle.title} ${vehicle.yearLabel}`}
            tone={tone}
          />
        }
        /*
         * Os dois cards do "Facilite sua compra": simulador com o preço deste
         * veículo, e o card de troca. Nenhum dos dois envia daqui — os dois
         * levam para a página completa, onde a pessoa dá o contato uma vez só.
         */
        financingForm={
          !vehicle.priceOnRequest ? (
            <FinancingEstimator
              defaults={context.site.financing}
              initialPriceCents={vehicle.priceCents}
              continueHref={`${context.links.financing}?veiculo=${vehicle.id}`}
              continueLabel="Simular condições"
            />
          ) : null
        }
        tradeInForm={<SellCarTeaser href={context.links.sellCar} />}
      />
    </>
  );
}
