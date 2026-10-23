import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/shell";
import { VehicleForm } from "@/components/admin/vehicle-form";
import { emptyVehicle } from "@/components/admin/vehicle-defaults";
import { requireTenantPage } from "@/lib/auth/guards";
import { can } from "@/lib/auth/rbac";
import { getAppraisal } from "@/lib/services/appraisals";
import { defaultStoreId, listStores } from "@/lib/services/stores";
import { tenantHasFeature } from "@/lib/api/feature-guard";

export const metadata: Metadata = { title: "Novo veículo" };
export const dynamic = "force-dynamic";

export default async function NewVehiclePage({
  searchParams,
}: {
  searchParams: Promise<{ avaliacao?: string }>;
}) {
  const context = await requireTenantPage("vehicles:write");
  const { avaliacao } = await searchParams;

  /**
   * Carro que veio de uma avaliação chega com a ficha preenchida.
   *
   * O que a avaliação sabe já foi digitado uma vez — marca, modelo, ano,
   * quilometragem, a referência da FIPE. Pedir tudo de novo é o que faz a
   * pessoa parar de usar a avaliação e voltar a decidir de cabeça.
   *
   * A permissão de ler avaliação é conferida além da de escrever veículo:
   * quem não pode ver o que a revenda pagou não passa a ver por causa de um
   * parâmetro na URL.
   */
  const appraisal =
    avaliacao && can(context.role, "appraisals:read")
      ? await getAppraisal(context.tenant.id, avaliacao)
      : null;

  const stores = (await tenantHasFeature(context.tenant.id, "gestao_multiunidade"))
    ? await listStores(context.tenant.id, true)
    : [];

  const initial = emptyVehicle();
  if (stores.length > 0) {
    // a unidade da avaliação vale mais que a padrão: o carro entrou por ela
    const preferred = appraisal?.storeId ?? (await defaultStoreId(context.tenant.id));
    initial.storeId = stores.some((store) => store.id === preferred) ? preferred! : "";
  }
  if (appraisal) {
    initial.brand = appraisal.brand;
    initial.model = appraisal.model;
    initial.version = appraisal.version ?? "";
    initial.yearManufacture = appraisal.yearManufacture;
    initial.yearModel = appraisal.yearModel;
    initial.mileageKm = appraisal.mileageKm;
    initial.color = appraisal.color ?? "";
    initial.licensePlate = appraisal.licensePlate ?? "";
    // o preço do anúncio é a venda pretendida na avaliação, não a oferta
    initial.priceCents = appraisal.targetSaleCents;
    initial.fipeCode = appraisal.fipeCode;
    initial.fipePriceCents = appraisal.fipePriceCents || null;
    initial.fipeReference = appraisal.fipeReference;
  }

  return (
    <>
      <PageHeader
        title="Novo veículo"
        description={
          appraisal
            ? `Ficha preenchida com a avaliação de ${appraisal.customerName}. Confira antes de salvar.`
            : "Ficha e fotos na mesma tela. Nada é publicado até você salvar."
        }
      />
      <VehicleForm
        initial={initial}
        appraisalId={appraisal?.id}
        stores={stores.map((store) => ({ id: store.id, name: store.name }))}
      />
    </>
  );
}
