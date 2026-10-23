"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Accordion } from "@/components/ui/accordion";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Checkbox, FormField, Input, Select, Textarea } from "@/components/ui/field";
import { BODY_TYPES, FUELS, TRANSMISSIONS, VEHICLE_STATUS } from "@/db/schema";
import {
  BODY_TYPE_LABELS,
  COLORS,
  FUEL_LABELS,
  TRANSMISSION_LABELS,
  VEHICLE_STATUS_LABELS,
} from "@/lib/catalog/labels";
import { OPTION_GROUPS, VEHICLE_OPTIONS } from "@/lib/catalog/options";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import { PhotoManager, type PhotoItem } from "@/components/admin/photo-manager";
import { useFipe, type FipeQuote } from "@/components/admin/use-fipe";
import { CatalogSelect } from "@/components/admin/catalog-select";
import { CurrencyInput, IntegerInput } from "@/components/ui/number-field";
import { centsToCurrencyInput, parseCurrencyToCents } from "@/lib/format/number-input";
import {
  formatFipeYearLabel,
  normalizeFipeYear,
  priceGapPercent,
  priceVerdict,
} from "@/lib/integrations/fipe";
import { inferSpecs } from "@/lib/integrations/fipe-specs";
import { isZeroKm } from "@/lib/integrations/fipe";
import { PLATE_LENGTH, isValidPlate, normalizePlate } from "@/lib/format/plate";
import { formatCurrency } from "@/lib/utils";
import { apiDelete, apiPatch, apiPost } from "@/lib/client/api";
import type { VehicleFormValues } from "./vehicle-form-types";


const CURRENT_YEAR = new Date().getFullYear();

function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

function inputToCents(value: string): number {
  const normalized = value.replace(/\./g, "").replace(",", ".");
  return Math.round((Number(normalized) || 0) * 100);
}

export function VehicleForm({
  initial,
  readOnly,
  photos = [],
  appraisalId,
  stores = [],
}: {
  initial: VehicleFormValues;
  readOnly?: boolean;
  photos?: PhotoItem[];
  /** Avaliação que originou esta ficha, quando veio de lá. */
  appraisalId?: string;
  /** Unidades ativas; vazio esconde o campo (revenda de uma loja só). */
  stores?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const isEditing = Boolean(initial.id);

  const [values, setValues] = useState<VehicleFormValues>(initial);
  const [priceText, setPriceText] = useState(centsToInput(initial.priceCents));
  const [fipeYear, setFipeYear] = useState("");
  const [loadingQuote, setLoadingQuote] = useState(false);

  /**
   * Campos que a consulta preencheu e que ficam travados.
   *
   * Evita que alguém altere sem querer um dado que veio da tabela — mas a
   * trava tem saída, porque câmbio, carroceria e portas saem de leitura do
   * nome do modelo. Palpite travado vira dado errado permanente, e quem
   * cadastra é quem está olhando para o carro.
   */
  const [fipeLocked, setFipeLocked] = useState<Set<string>>(new Set());
  const locked = (field: string) => fipeLocked.has(field);
  const [saving, setSaving] = useState(false);

  /**
   * Rascunho aberto para receber as fotos antes de a ficha existir.
   *
   * Enquanto ele estiver aqui e a ficha não tiver sido salva, existe trabalho
   * que se perde ao sair da tela — daí o aviso de saída e o botão de descartar.
   */
  const [draftId, setDraftId] = useState<string | null>(null);
  const [photoCount, setPhotoCount] = useState(photos.length);
  const [discarding, setDiscarding] = useState(false);

  const hasUnsavedPhotos = !isEditing && draftId !== null && photoCount > 0;

  // sair com fotos enviadas e ficha não salva perde as fotos
  useEffect(() => {
    if (!hasUnsavedPhotos) return;
    function warn(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnsavedPhotos]);

  /** Abre o rascunho no primeiro envio de foto. */
  async function ensureDraft(): Promise<string | null> {
    if (draftId) return draftId;
    const result = await apiPost<{ id: string }>("/api/admin/vehicles/draft");
    if (!result.ok) {
      toast.error("Não consegui preparar o envio das fotos", result.error);
      return null;
    }
    setDraftId(result.data.id);
    return result.data.id;
  }

  async function handleDiscard() {
    const confirmed = await confirm({
      title: "Descartar cadastro",
      description: `Você sai sem salvar e ${photoCount === 1 ? "a foto enviada é apagada" : `as ${photoCount} fotos enviadas são apagadas`}.`,
      confirmLabel: "Descartar",
      cancelLabel: "Continuar cadastrando",
      tone: "danger",
    });
    if (!confirmed || !draftId) return;

    setDiscarding(true);
    await apiDelete(`/api/admin/vehicles/${draftId}`);
    setDraftId(null);
    setPhotoCount(0);
    setDiscarding(false);
    router.push("/admin/estoque");
  }


  /**
   * A FIPE agora alimenta os próprios campos de marca e modelo.
   *
   * Antes havia um card separado perguntando as duas coisas de novo, e só
   * depois o formulário — a mesma pergunta duas vezes na mesma tela.
   */
  const fipe = useFipe(values.brand, values.model, values.version);

  function update<K extends keyof VehicleFormValues>(key: K, value: VehicleFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  /*
   * Só reclama da placa quando ela está completa.
   *
   * Validar a cada tecla deixaria o campo vermelho durante a digitação inteira
   * — dizendo à pessoa algo que ela já sabe, e fazendo-a duvidar do que
   * escreveu. Placa vazia também não é erro: o campo é opcional.
   */
  const placaInvalida =
    values.licensePlate.length === PLATE_LENGTH && !isValidPlate(values.licensePlate);

  /**
   * Traz a FIPE para a ficha sem apagar o que a pessoa já preencheu.
   *
   * Marca, modelo e ano vêm da tabela porque é o que padroniza o estoque. O
   * preço NÃO é copiado: a FIPE é referência, e o valor de venda é decisão da
   * revenda — sobrescrever aqui apagaria uma escolha comercial.
   */
  /**
   * Compara o preço pedido com a referência gravada.
   *
   * Fica ao lado do campo, não num painel separado: a comparação só ajuda no
   * instante em que a pessoa decide o número. Depois de salvo, ninguém volta
   * para conferir.
   */
  const fipeHint = useMemo(() => {
    if (!values.fipePriceCents) return undefined;

    const gap = priceGapPercent(inputToCents(priceText), values.fipePriceCents);
    const verdict = priceVerdict(gap);
    if (gap === null || verdict === null) {
      return `FIPE ${formatCurrency(values.fipePriceCents)}`;
    }

    const distance = `${Math.abs(gap).toFixed(1).replace(".", ",")}%`;
    if (verdict === "na_faixa") return `Na faixa da FIPE (${distance} de diferença)`;
    return verdict === "acima"
      ? `${distance} acima da FIPE`
      : `${distance} abaixo da FIPE`;
  }, [priceText, values.fipePriceCents]);

  /**
   * Sem toast nos dois lados.
   *
   * O sucesso já aparece na dica do próprio campo, com valor e mês da
   * referência; o erro já aparece no aviso do topo da seção. Avisar de novo
   * seria a mesma informação em dois lugares, e toast que confirma o óbvio
   * ensina a pessoa a ignorar os toasts que importam.
   */
  async function pickFipeYear(yearCode: string) {
    setFipeYear(yearCode);
    if (!yearCode) return;

    setLoadingQuote(true);
    const quote = await fipe.fetchQuote(yearCode);
    setLoadingQuote(false);

    if (quote) applyFipe(quote);
  }

  /**
   * Preenche a ficha com o que a consulta permite deduzir.
   *
   * Só campo VAZIO é tocado. O nome do modelo da FIPE carrega câmbio,
   * carroceria e portas, mas isso é leitura de texto — palpite fundamentado, e
   * palpite não sobrescreve o que a pessoa já respondeu.
   */
  function applyFipe(result: FipeQuote) {
    const specs = inferSpecs(result.modelo, result.combustivel);
    const zeroKm = isZeroKm(result.anoModelo);
    const filled = new Set<string>();

    setValues((current) => {
      const next = { ...current };

      // só campo vazio é preenchido — e só o que foi preenchido trava
      if (!current.transmission && specs.transmission) {
        next.transmission = specs.transmission;
        filled.add("transmission");
      }
      if (!current.fuel && specs.fuel) {
        next.fuel = specs.fuel;
        filled.add("fuel");
      }
      if (!current.bodyType && specs.bodyType) {
        next.bodyType = specs.bodyType;
        filled.add("bodyType");
      }
      if (!current.doors && specs.doors) {
        next.doors = String(specs.doors);
        filled.add("doors");
      }

      // 32000 é como a FIPE diz "zero km"; vira o ano corrente
      next.yearModel = normalizeFipeYear(result.anoModelo, CURRENT_YEAR);
      next.yearManufacture =
        current.yearManufacture || normalizeFipeYear(result.anoModelo, CURRENT_YEAR);

      // carro zero tem zero quilômetro: o campo perde a razão de existir
      if (zeroKm) {
        next.mileageKm = 0;
        filled.add("mileageKm");
      }

      next.fipeCode = result.codigoFipe;
      next.fipePriceCents = result.valorCents;
      next.fipeReference = result.mesReferencia;
      return next;
    });

    setFipeLocked(filled);
  }

  function toggleOption(optionKey: string) {
    setValues((current) => ({
      ...current,
      options: current.options.includes(optionKey)
        ? current.options.filter((item) => item !== optionKey)
        : [...current.options, optionKey],
    }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (readOnly) return;

    setSaving(true);

    const payload = {
      brand: values.brand.trim(),
      model: values.model.trim(),
      version: values.version.trim(),
      yearManufacture: values.yearManufacture,
      yearModel: values.yearModel,
      mileageKm: values.mileageKm,
      priceCents: inputToCents(priceText),
      priceOnRequest: values.priceOnRequest,
      transmission: values.transmission,
      fuel: values.fuel,
      bodyType: values.bodyType,
      color: values.color,
      doors: values.doors,
      licensePlate: values.licensePlate,
      options: values.options,
      description: values.description,
      status: values.status,
      featured: values.featured,
      // sem unidades na tela, não mexe no que está gravado
      ...(stores.length > 0 ? { storeId: values.storeId } : {}),
      fipeCode: values.fipeCode,
      fipePriceCents: values.fipePriceCents,
      fipeReference: values.fipeReference,
    };

    // o rascunho já existe e já tem as fotos: completar ele, não criar outro
    const target = isEditing ? initial.id : draftId;
    const result = target
      ? await apiPatch<{ id: string }>(`/api/admin/vehicles/${target}`, payload)
      : await apiPost<{ id: string }>("/api/admin/vehicles", payload);

    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    if (isEditing) {
      toast.success("Veículo atualizado.");
      router.refresh();
      return;
    }

    const vehicleId = target ?? result.data.id;

    /*
     * Fecha o laço com a avaliação.
     *
     * Sem isso não há como perguntar depois quanto custou o carro que está à
     * venda — a avaliação é o único lugar onde o preço de compra existe. A
     * falha aqui não desfaz o cadastro: o veículo está salvo, e refazer o
     * vínculo é um clique, enquanto perder a ficha seria perder o trabalho.
     */
    if (appraisalId) {
      const link = await apiPost(`/api/admin/appraisals/${appraisalId}/vehicle`, { vehicleId });
      if (!link.ok) {
        toast.error("Veículo salvo, mas não liguei à avaliação", link.error);
      }
    }

    // salvo: as fotos deixaram de ser provisórias, o aviso de saída sai de cena
    setDraftId(null);
    toast.success(
      photoCount > 0
        ? "Veículo cadastrado com as fotos."
        : "Veículo cadastrado. Você pode adicionar fotos a qualquer momento.",
    );
    router.push(`/admin/estoque/${vehicleId}`);
    router.refresh();
  }

  const optionCount = values.options.length;
  const hasDescription = values.description.trim().length > 0;

  /**
   * Cor fora do catálogo continua na lista.
   *
   * Sem isso, abrir um veículo antigo com a cor digitada à mão apagaria o
   * valor ao salvar, e a pessoa nem veria acontecer.
   */
  const colorOptions =
    values.color && !COLORS.includes(values.color) ? [values.color, ...COLORS] : COLORS;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Accordion title="Identificação" summary="Marca, modelo e ano">
        {/* uma vez, no topo: repetir em cada campo viraria três avisos iguais */}
        {fipe.failure && !readOnly ? (
          <Alert tone="warning" className="mb-6">
            {fipe.failure}
          </Alert>
        ) : null}

        <div className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
          <FormField label="Marca" htmlFor="brand">
            <CatalogSelect
              id="brand"
              value={values.brand}
              options={fipe.brands}
              disabled={readOnly}
              loading={fipe.loadingBrands}
              placeholder="Escolha a marca"
              onChange={(next) => {
                // trocar a marca invalida o que veio da anterior
                setValues((current) => ({ ...current, brand: next, model: "", version: "" }));
                setFipeYear("");
                setFipeLocked(new Set());
              }}
            />
          </FormField>

          <FormField label="Modelo" htmlFor="model">
            <CatalogSelect
              id="model"
              value={values.model}
              options={fipe.models}
              disabled={readOnly || !values.brand}
              loading={fipe.loadingModels}
              placeholder={values.brand ? "Escolha o modelo" : "Escolha a marca primeiro"}
              onChange={(next) => {
                setValues((current) => ({ ...current, model: next, version: "" }));
                setFipeYear("");
                setFipeLocked(new Set());
              }}
            />
          </FormField>

          <FormField label="Versão" htmlFor="version">
            <CatalogSelect
              id="version"
              value={values.version}
              options={fipe.versions}
              disabled={readOnly || !values.model}
              loading={fipe.loadingModels}
              placeholder={values.model ? "Escolha a versão" : "Escolha o modelo primeiro"}
              onChange={(next) => {
                update("version", next);
                setFipeYear("");
                setFipeLocked(new Set());
              }}
            />
          </FormField>

          {/*
            `|| ""` porque zero aqui quer dizer "ainda não sei": mostrar "0"
            no campo seria pior que mostrar nada.
          */}
          <FormField label="Ano de fabricação" htmlFor="yearManufacture">
            <Input
              id="yearManufacture"
              type="number"
              required
              min={1950}
              max={CURRENT_YEAR + 2}
              disabled={readOnly}
              value={values.yearManufacture || ""}
              onChange={(event) => update("yearManufacture", Number(event.target.value))}
            />
          </FormField>

          <FormField label="Ano do modelo" htmlFor="yearModel">
            <Input
              id="yearModel"
              type="number"
              required
              min={1950}
              max={CURRENT_YEAR + 2}
              disabled={readOnly}
              value={values.yearModel || ""}
              onChange={(event) => update("yearModel", Number(event.target.value))}
            />
          </FormField>

          {/*
            Aparece só quando há o que consultar. Escolher aqui preenche os anos
            e grava o preço de referência — é o que antes exigia repetir marca e
            modelo num card à parte.
          */}
          {!readOnly && fipe.years.length > 0 ? (
            <FormField
              label="Ano na tabela FIPE"
              htmlFor="fipe-year"
              hint={
                values.fipePriceCents
                  ? `Referência: ${(values.fipePriceCents / 100).toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })} · ${values.fipeReference ?? ""}`
                  : "Preenche os anos e traz o preço de referência"
              }
            >
              <Select
                id="fipe-year"
                value={fipeYear}
                disabled={loadingQuote}
                onChange={(event) => void pickFipeYear(event.target.value)}
              >
                <option value="">
                  {loadingQuote ? "Consultando..." : "Escolha o ano"}
                </option>
                {fipe.years.map((year) => (
                  <option key={year.codigo} value={year.codigo}>
                    {formatFipeYearLabel(year.nome)}
                  </option>
                ))}
              </Select>
            </FormField>
          ) : null}

          <FormField
            label="Quilometragem"
            htmlFor="mileageKm"
            hint={locked("mileageKm") ? "Zero km, pela tabela FIPE" : undefined}
          >
            <IntegerInput
              id="mileageKm"
              disabled={readOnly || locked("mileageKm")}
              value={values.mileageKm}
              onChangeNumber={(next) => update("mileageKm", next)}
            />
          </FormField>
        </div>
      </Accordion>

      <Accordion title="Ficha técnica" summary="Câmbio, combustível e cor">
        {/* a trava precisa de saída visível: o que veio do nome do modelo é
            dedução, e quem cadastra está olhando para o carro */}
        {fipeLocked.size > 0 && !readOnly ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-inner border border-border bg-surface-2 px-4 py-3">
            <p className="text-sm text-muted">
              {fipeLocked.size} campo(s) preenchidos pela tabela FIPE.
            </p>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setFipeLocked(new Set())}
            >
              Corrigir à mão
            </Button>
          </div>
        ) : null}

        <div className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
          <FormField label="Câmbio" htmlFor="transmission">
            <Select
              id="transmission"
              disabled={readOnly || locked("transmission")}
              value={values.transmission}
              onChange={(event) => update("transmission", event.target.value)}
            >
              <option value="">Não informado</option>
              {TRANSMISSIONS.map((value) => (
                <option key={value} value={value}>
                  {TRANSMISSION_LABELS[value]}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField label="Combustível" htmlFor="fuel">
            <Select
              id="fuel"
              disabled={readOnly || locked("fuel")}
              value={values.fuel}
              onChange={(event) => update("fuel", event.target.value)}
            >
              <option value="">Não informado</option>
              {FUELS.map((value) => (
                <option key={value} value={value}>
                  {FUEL_LABELS[value]}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField label="Carroceria" htmlFor="bodyType">
            <Select
              id="bodyType"
              disabled={readOnly || locked("bodyType")}
              value={values.bodyType}
              onChange={(event) => update("bodyType", event.target.value)}
            >
              <option value="">Não informado</option>
              {BODY_TYPES.map((value) => (
                <option key={value} value={value}>
                  {BODY_TYPE_LABELS[value]}
                </option>
              ))}
            </Select>
          </FormField>

          {/*
            Cor virou lista fechada. Digitada à mão, o mesmo tom vira "Prata",
            "prata" e "Cinza prata" no estoque, e o filtro do site passa a
            mostrar três cores onde existe uma.
          */}
          <FormField label="Cor" htmlFor="color">
            <Select
              id="color"
              disabled={readOnly}
              value={values.color}
              onChange={(event) => update("color", event.target.value)}
            >
              <option value="">Não informada</option>
              {colorOptions.map((color) => (
                <option key={color} value={color}>
                  {color}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField label="Portas" htmlFor="doors">
            <Select
              id="doors"
              disabled={readOnly || locked("doors")}
              value={values.doors}
              onChange={(event) => update("doors", event.target.value)}
            >
              <option value="">Não informado</option>
              {[2, 3, 4, 5].map((value) => (
                <option key={value} value={value}>
                  {value} portas
                </option>
              ))}
            </Select>
          </FormField>

          {/*
            A validação só reclama com a placa COMPLETA. Avisar a cada tecla
            marcaria o campo de vermelho enquanto a pessoa ainda está
            digitando — o que ela já sabe, e que a faria duvidar do que
            escreveu.
          */}
          <FormField
            label="Placa"
            htmlFor="licensePlate"
            hint="Formato antigo (ABC1234) ou Mercosul (ABC1D23)"
            error={placaInvalida ? "Placa inválida. Confira os 7 caracteres." : undefined}
          >
            <Input
              id="licensePlate"
              maxLength={PLATE_LENGTH}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              placeholder="ABC1D23"
              disabled={readOnly}
              value={values.licensePlate}
              onChange={(event) => update("licensePlate", normalizePlate(event.target.value))}
            />
          </FormField>
        </div>
      </Accordion>

      <Accordion title="Preço e publicação" summary="Valor e onde o anúncio aparece">
        <div className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
          <FormField label="Preço (R$)" htmlFor="price" hint={fipeHint}>
            <CurrencyInput
              id="price"
              disabled={readOnly || values.priceOnRequest}
              valueCents={parseCurrencyToCents(priceText)}
              onChangeCents={(cents) => setPriceText(centsToCurrencyInput(cents))}
            />
          </FormField>

          <FormField label="Situação do anúncio" htmlFor="status">
            <Select
              id="status"
              disabled={readOnly}
              value={values.status}
              onChange={(event) => update("status", event.target.value)}
            >
              {VEHICLE_STATUS.map((status) => (
                <option key={status} value={status}>
                  {VEHICLE_STATUS_LABELS[status]}
                </option>
              ))}
            </Select>
          </FormField>

          {stores.length > 0 ? (
            <FormField label="Unidade" htmlFor="storeId" hint="Loja onde o carro está.">
              <Select
                id="storeId"
                disabled={readOnly}
                value={values.storeId}
                onChange={(event) => update("storeId", event.target.value)}
              >
                <option value="">Sem unidade</option>
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </Select>
            </FormField>
          ) : null}

          <div className="mb-4 flex flex-col justify-center gap-2.5">
            <label className="flex items-center gap-2 text-[13px] text-text">
              <Checkbox
                disabled={readOnly}
                checked={values.priceOnRequest}
                onChange={(event) => update("priceOnRequest", event.target.checked)}
              />
              Preço sob consulta
            </label>
            <label className="flex items-center gap-2 text-[13px] text-text">
              <Checkbox
                disabled={readOnly}
                checked={values.featured}
                onChange={(event) => update("featured", event.target.checked)}
              />
              Destacar na home do site
            </label>
          </div>
        </div>

        <p className="text-xs text-muted">
          Somente anúncios <strong>disponíveis</strong> e <strong>reservados</strong> aparecem no
          site público.
        </p>
      </Accordion>

      {/*
        Sessenta caixas de seleção dominavam a página. Fechada por padrão, com a
        contagem no cabeçalho para ninguém esquecer que a seção existe.
      */}
      <Accordion
        title="Opcionais"
        defaultOpen={optionCount > 0}
        summary={optionCount === 0 ? "nenhum marcado" : optionCount + " marcados"}
        badge={optionCount > 0 ? <Badge tone="info">{optionCount}</Badge> : null}
      >
        <div className="space-y-5">
          {OPTION_GROUPS.map((group) => (
            <div key={group}>
              <p className="label-instrument mb-2 text-faint">{group}</p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {VEHICLE_OPTIONS.filter((option) => option.group === group).map((option) => (
                  <label key={option.key} className="flex items-center gap-2 text-[13px] text-text">
                    <Checkbox
                      disabled={readOnly}
                      checked={values.options.includes(option.key)}
                      onChange={() => toggleOption(option.key)}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Accordion>

      <Accordion
        title="Descrição"
        defaultOpen={hasDescription}
        summary={hasDescription ? "preenchida" : "vazia"}
      >
        <FormField label="Texto do anúncio" htmlFor="description" className="mb-0">
          <Textarea
            id="description"
            rows={6}
            disabled={readOnly}
            value={values.description}
            onChange={(event) => update("description", event.target.value)}
            placeholder="Único dono, revisões em concessionária, pneus novos..."
          />
        </FormField>
      </Accordion>

      <PhotoManager
        vehicleId={isEditing ? initial.id : draftId ?? undefined}
        photos={photos}
        disabled={readOnly}
        resolveVehicleId={isEditing ? undefined : ensureDraft}
        onPhotosChange={setPhotoCount}
      />

      {/*
        Barra fixa no rodapé: o formulário é longo, e o botão de salvar no fim
        da rolagem obriga a percorrer a página inteira para concluir.

        Sair fica à esquerda e concluir à direita — a ação que avança mora no
        canto para onde a leitura termina, e a que desiste fica longe dela.
      */}
      {!readOnly ? (
        <div className="sticky bottom-4 z-20 flex flex-wrap items-center justify-between gap-4 rounded-card border border-border bg-surface px-6 py-4">
          {hasUnsavedPhotos ? (
            <Button
              type="button"
              variant="outlineDanger"
              loading={discarding}
              onClick={handleDiscard}
            >
              Descartar cadastro
            </Button>
          ) : (
            <Button type="button" variant="ghost" onClick={() => router.push("/admin/estoque")}>
              Cancelar
            </Button>
          )}

          <div className="flex flex-wrap items-center justify-end gap-4">
            {hasUnsavedPhotos ? (
              <p className="text-sm text-warning">
                {photoCount === 1 ? "1 foto enviada" : photoCount + " fotos enviadas"}. Salve para
                não perdê-las.
              </p>
            ) : null}
            <Button type="submit" loading={saving}>
              {isEditing ? "Salvar alterações" : "Cadastrar veículo"}
            </Button>
          </div>
        </div>
      ) : null}
    </form>
  );
}
