"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Pencil, Plus, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm";
import { Dialog } from "@/components/ui/dialog";
import { FormField, Input, Select, Textarea } from "@/components/ui/field";
import { maskPhone } from "@carbud/site-kit/masks";
import { CurrencyInput, IntegerInput } from "@/components/ui/number-field";
import { EmptyState, Table, Td, Th, Thead, Tr } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { CatalogSelect } from "@/components/admin/catalog-select";
import { useFipe } from "@/components/admin/use-fipe";
import { APPRAISAL_STATUS, type AppraisalStatus } from "@/db/schema";
import { APPRAISAL_STATUS_LABELS, COLORS } from "@/lib/catalog/labels";
import { apiDelete, apiPatch, apiPost, fieldErrorsFrom, type FieldErrors } from "@/lib/client/api";
import { formatFipeYearLabel, normalizeFipeYear } from "@/lib/integrations/fipe";
import {
  acquisitionCost,
  appraisalMargin,
  marginPercent,
  offerGapPercent,
  suggestedOffer,
} from "@/lib/services/appraisals";
import { PLATE_LENGTH, isValidPlate, normalizePlate } from "@/lib/format/plate";
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils";

export type AppraisalRow = {
  id: string;
  customerName: string;
  customerPhone: string | null;
  brand: string;
  model: string;
  version: string | null;
  yearManufacture: number;
  yearModel: number;
  mileageKm: number;
  color: string | null;
  licensePlate: string | null;
  fipeCode: string | null;
  fipePriceCents: number;
  fipeReference: string | null;
  conditionCents: number;
  repairsCents: number;
  debtsCents: number;
  marketAdjustCents: number;
  suggestedCents: number;
  offerCents: number;
  targetSaleCents: number;
  status: AppraisalStatus;
  validUntil: string | null;
  notes: string | null;
  vehicleId: string | null;
  createdAt: string;
};

const TONES: Record<AppraisalStatus, BadgeTone> = {
  rascunho: "neutral",
  enviada: "warning",
  aceita: "success",
  recusada: "danger",
  expirada: "neutral",
};

const CURRENT_YEAR = new Date().getFullYear();

function emptyRow(): AppraisalRow {
  return {
    id: "",
    customerName: "",
    customerPhone: "",
    brand: "",
    model: "",
    version: "",
    yearManufacture: 0,
    yearModel: 0,
    mileageKm: 0,
    color: "",
    licensePlate: "",
    fipeCode: null,
    fipePriceCents: 0,
    fipeReference: null,
    conditionCents: 0,
    repairsCents: 0,
    debtsCents: 0,
    marketAdjustCents: 0,
    suggestedCents: 0,
    offerCents: 0,
    targetSaleCents: 0,
    status: "rascunho",
    validUntil: null,
    notes: "",
    vehicleId: null,
    createdAt: new Date().toISOString(),
  };
}

function vehicleLabel(row: AppraisalRow): string {
  const name = [row.brand, row.model, row.version].filter(Boolean).join(" ");
  const years = row.yearManufacture || row.yearModel ? ` ${row.yearManufacture}/${row.yearModel}` : "";
  return `${name}${years}`.trim();
}

export function AppraisalsPanel({
  appraisals,
  canWrite,
  canCreateVehicle,
}: {
  appraisals: AppraisalRow[];
  canWrite: boolean;
  canCreateVehicle: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<AppraisalRow | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(row: AppraisalRow) {
    const confirmed = await confirm({
      title: "Excluir avaliação",
      description: `A avaliação do ${vehicleLabel(row)} de ${row.customerName} é apagada. Não dá para desfazer.`,
      confirmLabel: "Excluir avaliação",
      tone: "danger",
    });
    if (!confirmed) return;

    setDeletingId(row.id);
    const result = await apiDelete(`/api/admin/appraisals/${row.id}`);
    setDeletingId(null);

    if (!result.ok) {
      toast.error("Não consegui excluir", result.error);
      return;
    }
    toast.success("Avaliação excluída");
    router.refresh();
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Carros avaliados</CardTitle>
            <CardDescription>
              A conta parte da tabela FIPE e desconta o que o carro precisa. O valor sugerido é
              calculado; o ofertado é a decisão de quem atendeu, e a diferença entre os dois fica à
              vista.
            </CardDescription>
          </div>
          {canWrite ? (
            <Button type="button" className="shrink-0" onClick={() => setEditing(emptyRow())}>
              <Plus className="h-3.5 w-3.5" />
              Nova avaliação
            </Button>
          ) : null}
        </CardHeader>

        {appraisals.length === 0 ? (
          <EmptyState
            title="Nenhuma avaliação"
            description="Registre a primeira para ter o preço de compra escrito, e não só combinado."
          />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Cliente</Th>
                <Th>Veículo</Th>
                <Th numeric>FIPE</Th>
                <Th numeric>Sugerido</Th>
                <Th numeric>Ofertado</Th>
                <Th numeric>Margem</Th>
                <Th>Situação</Th>
                <Th />
              </Tr>
            </Thead>
            <tbody>
              {appraisals.map((row) => {
                const gap = offerGapPercent(row.offerCents, row.suggestedCents);
                const margin = appraisalMargin(
                  row.targetSaleCents,
                  row.offerCents,
                  row.repairsCents,
                  row.debtsCents,
                );

                return (
                  <Tr key={row.id}>
                    <Td>
                      <div className="font-medium text-text">{row.customerName}</div>
                      {row.customerPhone ? (
                        <div className="text-xs text-faint">{row.customerPhone}</div>
                      ) : null}
                    </Td>
                    <Td>
                      <div>{vehicleLabel(row)}</div>
                      {row.mileageKm > 0 ? (
                        <div className="text-xs text-faint">
                          {formatNumber(row.mileageKm)} km
                        </div>
                      ) : null}
                    </Td>
                    <Td numeric>
                      {row.fipePriceCents > 0 ? formatCurrency(row.fipePriceCents) : "—"}
                    </Td>
                    <Td numeric>{formatCurrency(row.suggestedCents)}</Td>
                    <Td numeric>
                      <div>{formatCurrency(row.offerCents)}</div>
                      {gap !== null && Math.abs(gap) >= 0.5 ? (
                        <div className={gap > 0 ? "text-xs text-warning" : "text-xs text-faint"}>
                          {gap > 0 ? "+" : ""}
                          {gap.toFixed(1).replace(".", ",")}%
                        </div>
                      ) : null}
                    </Td>
                    <Td numeric>
                      {row.targetSaleCents > 0 ? (
                        <span className={margin < 0 ? "text-danger" : "text-positive"}>
                          {formatCurrency(margin)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={TONES[row.status]}>
                          {APPRAISAL_STATUS_LABELS[row.status]}
                        </Badge>
                        {row.vehicleId ? <Badge tone="info">No estoque</Badge> : null}
                      </div>
                      <div className="mt-0.5 text-xs text-faint">
                        {formatDate(new Date(row.createdAt))}
                      </div>
                    </Td>
                    <Td>
                      <div className="flex justify-end gap-1">
                        {/*
                          O caminho para o estoque só aparece quando o negócio
                          fechou e ainda não virou ficha. Antes disso ele
                          convidaria a cadastrar carro que a revenda não comprou.
                        */}
                        {canCreateVehicle && row.status === "aceita" && !row.vehicleId ? (
                          <Link
                            href={`/admin/estoque/novo?avaliacao=${row.id}`}
                            title="Cadastrar no estoque"
                            className={buttonVariants({ variant: "ghost", size: "sm" })}
                          >
                            <ArrowRight className="h-3.5 w-3.5" />
                            Estoque
                          </Link>
                        ) : null}
                        {canWrite ? (
                          <>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditing(row)}
                              aria-label={`Editar avaliação de ${row.customerName}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              loading={deletingId === row.id}
                              onClick={() => handleDelete(row)}
                              aria-label={`Excluir avaliação de ${row.customerName}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      {editing ? (
        <AppraisalEditor
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------------ */
/* Editor                                                                    */
/* ------------------------------------------------------------------------ */

function AppraisalEditor({
  row,
  onClose,
  onSaved,
}: {
  row: AppraisalRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const isNew = !row.id;
  const [draft, setDraft] = useState(row);
  const [fipeYear, setFipeYear] = useState("");
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  // só reclama com a placa completa; durante a digitação seria ruído
  const placaInvalida =
    (draft.licensePlate ?? "").length === PLATE_LENGTH && !isValidPlate(draft.licensePlate);
  /**
   * Enquanto ninguém mexeu na oferta, ela acompanha o sugerido.
   *
   * É o comportamento que a pessoa espera: mexer num desconto move o número
   * final. Assim que ela digita a oferta, o acompanhamento para — a decisão
   * dela não pode ser apagada pelo próximo ajuste de centavo.
   */
  const [offerTouched, setOfferTouched] = useState(row.offerCents > 0);
  /**
   * O ajuste de mercado guarda o texto, não o número.
   *
   * É o único campo que aceita sinal, e `Number("-")` é NaN: quem digita o
   * menos antes do valor gravava NaN, que vira `null` no JSON e derruba a
   * validação no envio — com a mensagem apontando para outro campo.
   */
  const [marketText, setMarketText] = useState(
    row.marketAdjustCents === 0 ? "" : String(row.marketAdjustCents / 100),
  );

  const fipe = useFipe(draft.brand, draft.model, draft.version ?? "");

  function set<K extends keyof AppraisalRow>(key: K, value: AppraisalRow[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  const suggested = suggestedOffer({
    fipePriceCents: draft.fipePriceCents,
    conditionCents: draft.conditionCents,
    repairsCents: draft.repairsCents,
    debtsCents: draft.debtsCents,
    marketAdjustCents: draft.marketAdjustCents,
  });

  const offer = offerTouched ? draft.offerCents : suggested;

  const math = useMemo(() => {
    const cost = acquisitionCost(offer, draft.repairsCents, draft.debtsCents);
    const margin = draft.targetSaleCents - cost;
    return {
      cost,
      margin,
      marginPct: marginPercent(margin, draft.targetSaleCents),
      gap: offerGapPercent(offer, suggested),
    };
  }, [offer, suggested, draft.repairsCents, draft.debtsCents, draft.targetSaleCents]);

  /** Escolher o ano na tabela traz o preço de referência e preenche os anos. */
  async function pickFipeYear(yearCode: string) {
    setFipeYear(yearCode);
    if (!yearCode) return;

    setLoadingQuote(true);
    const quote = await fipe.fetchQuote(yearCode);
    setLoadingQuote(false);

    if (!quote) {
      toast.error("A FIPE não respondeu", "Dá para seguir preenchendo o valor à mão.");
      return;
    }

    setDraft((current) => ({
      ...current,
      fipeCode: quote.codigoFipe,
      fipePriceCents: quote.valorCents,
      fipeReference: quote.mesReferencia,
      yearModel: normalizeFipeYear(quote.anoModelo, CURRENT_YEAR),
      yearManufacture:
        current.yearManufacture || normalizeFipeYear(quote.anoModelo, CURRENT_YEAR),
    }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setErrors({});

    const payload = {
      customerName: draft.customerName.trim(),
      customerPhone: draft.customerPhone?.trim() || null,
      brand: draft.brand.trim(),
      model: draft.model.trim(),
      version: draft.version?.trim() || null,
      yearManufacture: draft.yearManufacture,
      yearModel: draft.yearModel,
      mileageKm: draft.mileageKm,
      color: draft.color?.trim() || null,
      licensePlate: draft.licensePlate?.trim() || null,
      fipeCode: draft.fipeCode,
      fipePriceCents: draft.fipePriceCents,
      fipeReference: draft.fipeReference,
      conditionCents: draft.conditionCents,
      repairsCents: draft.repairsCents,
      debtsCents: draft.debtsCents,
      marketAdjustCents: draft.marketAdjustCents,
      // o que vai para o banco é o número que está na tela, sugerido ou não
      offerCents: offer,
      targetSaleCents: draft.targetSaleCents,
      status: draft.status,
      validUntil: draft.validUntil,
      notes: draft.notes?.trim() || null,
    };

    const result = isNew
      ? await apiPost("/api/admin/appraisals", payload)
      : await apiPatch(`/api/admin/appraisals/${draft.id}`, payload);

    setSaving(false);

    if (!result.ok) {
      setErrors(fieldErrorsFrom(result.details));
      toast.error(isNew ? "Não consegui criar" : "Não consegui salvar", result.error);
      return;
    }
    toast.success(isNew ? "Avaliação registrada" : "Avaliação salva");
    onSaved();
  }

  return (
    <Dialog
      open
      size="lg"
      onClose={onClose}
      title={isNew ? "Nova avaliação" : `Avaliação de ${row.customerName}`}
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="appraisal-form" loading={saving}>
            {isNew ? "Registrar avaliação" : "Salvar"}
          </Button>
        </div>
      }
    >
      <form id="appraisal-form" onSubmit={handleSubmit} noValidate>
        {fipe.failure ? (
          <Alert tone="warning" className="mb-4">
            {fipe.failure} Dá para preencher o valor de referência à mão.
          </Alert>
        ) : null}

        {/* -------------------------------------------------------- cliente */}
        <div className="grid gap-x-4 sm:grid-cols-2">
          <FormField label="Cliente" htmlFor="av-name" error={errors.customerName}>
            <Input
              id="av-name"
              required
              value={draft.customerName}
              onChange={(event) => set("customerName", event.target.value)}
            />
          </FormField>
          <FormField label="Telefone" htmlFor="av-phone">
            <Input
              id="av-phone"
              inputMode="tel"
              mask={maskPhone}
              value={draft.customerPhone ?? ""}
              onChange={(event) => set("customerPhone", event.target.value)}
            />
          </FormField>
        </div>

        {/* -------------------------------------------------------- veículo */}
        <div className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
          <FormField label="Marca" htmlFor="av-brand" error={errors.brand}>
            <CatalogSelect
              id="av-brand"
              value={draft.brand}
              options={fipe.brands}
              loading={fipe.loadingBrands}
              placeholder="Escolha a marca"
              onChange={(next) => {
                setDraft((current) => ({ ...current, brand: next, model: "", version: "" }));
                setFipeYear("");
              }}
            />
          </FormField>

          <FormField label="Modelo" htmlFor="av-model" error={errors.model}>
            <CatalogSelect
              id="av-model"
              value={draft.model}
              options={fipe.models}
              disabled={!draft.brand}
              loading={fipe.loadingModels}
              placeholder={draft.brand ? "Escolha o modelo" : "Escolha a marca primeiro"}
              onChange={(next) => {
                setDraft((current) => ({ ...current, model: next, version: "" }));
                setFipeYear("");
              }}
            />
          </FormField>

          <FormField label="Versão" htmlFor="av-version">
            <CatalogSelect
              id="av-version"
              value={draft.version ?? ""}
              options={fipe.versions}
              disabled={!draft.model}
              loading={fipe.loadingModels}
              placeholder={draft.model ? "Escolha a versão" : "Escolha o modelo primeiro"}
              onChange={(next) => {
                set("version", next);
                setFipeYear("");
              }}
            />
          </FormField>

          {fipe.years.length > 0 ? (
            <FormField
              label="Ano na tabela FIPE"
              htmlFor="av-fipe-year"
              hint={
                draft.fipePriceCents
                  ? `Referência: ${formatCurrency(draft.fipePriceCents)}${
                      draft.fipeReference ? ` · ${draft.fipeReference}` : ""
                    }`
                  : undefined
              }
            >
              <Select
                id="av-fipe-year"
                value={fipeYear}
                disabled={loadingQuote}
                onChange={(event) => void pickFipeYear(event.target.value)}
              >
                <option value="">{loadingQuote ? "Consultando..." : "Escolha o ano"}</option>
                {fipe.years.map((year) => (
                  <option key={year.codigo} value={year.codigo}>
                    {formatFipeYearLabel(year.nome)}
                  </option>
                ))}
              </Select>
            </FormField>
          ) : null}

          <FormField label="Ano de fabricação" htmlFor="av-year-man" error={errors.yearManufacture}>
            <Input
              id="av-year-man"
              type="number"
              required
              min={1950}
              max={CURRENT_YEAR + 2}
              value={draft.yearManufacture || ""}
              onChange={(event) => set("yearManufacture", Number(event.target.value))}
            />
          </FormField>

          <FormField label="Ano do modelo" htmlFor="av-year-mod" error={errors.yearModel}>
            <Input
              id="av-year-mod"
              type="number"
              required
              min={1950}
              max={CURRENT_YEAR + 2}
              value={draft.yearModel || ""}
              onChange={(event) => set("yearModel", Number(event.target.value))}
            />
          </FormField>

          <FormField label="Quilometragem" htmlFor="av-km">
            <IntegerInput
              id="av-km"
              value={draft.mileageKm}
              onChangeNumber={(next) => set("mileageKm", next)}
            />
          </FormField>

          <FormField label="Cor" htmlFor="av-color">
            <Select
              id="av-color"
              value={draft.color ?? ""}
              onChange={(event) => set("color", event.target.value)}
            >
              <option value="">Não informado</option>
              {COLORS.map((color) => (
                <option key={color} value={color}>
                  {color}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField
            label="Placa"
            htmlFor="av-plate"
            error={
              placaInvalida ? "Placa inválida. Confira os 7 caracteres." : undefined
            }
          >
            <Input
              id="av-plate"
              maxLength={PLATE_LENGTH}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              placeholder="ABC1D23"
              value={draft.licensePlate ?? ""}
              onChange={(event) => set("licensePlate", normalizePlate(event.target.value))}
            />
          </FormField>
        </div>

        {/* ------------------------------------------------------ descontos */}
        <p className="label-instrument mb-3 mt-2 text-faint">Descontos</p>
        <div className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-4">
          <FormField label="Referência FIPE (R$)" htmlFor="av-fipe">
            <CurrencyInput
              id="av-fipe"
              valueCents={draft.fipePriceCents}
              onChangeCents={(cents) => set("fipePriceCents", cents)}
            />
          </FormField>
          <FormField label="Estado do veículo (R$)" htmlFor="av-condition">
            <CurrencyInput
              id="av-condition"
              valueCents={draft.conditionCents}
              onChangeCents={(cents) => set("conditionCents", cents)}
            />
          </FormField>
          <FormField label="Reparos a fazer (R$)" htmlFor="av-repairs">
            <CurrencyInput
              id="av-repairs"
              valueCents={draft.repairsCents}
              onChangeCents={(cents) => set("repairsCents", cents)}
            />
          </FormField>
          <FormField label="Débitos (R$)" htmlFor="av-debts">
            <CurrencyInput
              id="av-debts"
              valueCents={draft.debtsCents}
              onChangeCents={(cents) => set("debtsCents", cents)}
            />
          </FormField>
        </div>

        {/*
          O ajuste de mercado é o único campo que sobe o valor, e por isso mora
          separado dos descontos: misturá-lo na mesma linha faria a pessoa
          somar quando devia subtrair.
        */}
        <div className="grid gap-x-4 sm:grid-cols-2">
          <FormField
            label="Ajuste de mercado (R$)"
            htmlFor="av-market"
            hint="Positivo sobe a oferta; negativo desce"
          >
            <Input
              id="av-market"
              type="number"
              step="any"
              value={marketText}
              onChange={(event) => {
                const text = event.target.value;
                setMarketText(text);
                const reais = Number(text);
                set("marketAdjustCents", Number.isFinite(reais) ? Math.round(reais * 100) : 0);
              }}
            />
          </FormField>
        </div>

        {/* ---------------------------------------------------------- conta */}
        <div className="mb-4 rounded-inner border border-border bg-surface-2 px-4 py-3">
          <div className="grid gap-3 sm:grid-cols-4">
            <Figure label="Valor sugerido" value={formatCurrency(suggested)} />
            <Figure
              label="Oferta"
              value={formatCurrency(offer)}
              hint={
                math.gap !== null && Math.abs(math.gap) >= 0.5
                  ? `${math.gap > 0 ? "+" : ""}${math.gap.toFixed(1).replace(".", ",")}% do sugerido`
                  : undefined
              }
              alert={math.gap !== null && math.gap > 0}
            />
            <Figure
              label="Custo até a venda"
              value={formatCurrency(math.cost)}
              hint="Oferta + reparos + débitos"
            />
            <Figure
              label="Margem"
              value={draft.targetSaleCents > 0 ? formatCurrency(math.margin) : "—"}
              hint={
                math.marginPct !== null
                  ? `${math.marginPct.toFixed(1).replace(".", ",")}% da venda`
                  : undefined
              }
              danger={draft.targetSaleCents > 0 && math.margin < 0}
            />
          </div>
        </div>

        <div className="grid gap-x-4 sm:grid-cols-2">
          <FormField
            label="Oferta ao cliente (R$)"
            htmlFor="av-offer"
            hint={offerTouched ? undefined : "Acompanha o sugerido até você digitar"}
          >
            <CurrencyInput
              id="av-offer"
              valueCents={offer}
              onChangeCents={(cents) => {
                setOfferTouched(true);
                set("offerCents", cents);
              }}
            />
          </FormField>
          <FormField label="Venda pretendida (R$)" htmlFor="av-target">
            <CurrencyInput
              id="av-target"
              valueCents={draft.targetSaleCents}
              onChangeCents={(cents) => set("targetSaleCents", cents)}
            />
          </FormField>
        </div>

        {/* ------------------------------------------------------- situação */}
        <div className="grid gap-x-4 sm:grid-cols-2">
          <FormField label="Situação" htmlFor="av-status">
            <Select
              id="av-status"
              value={draft.status}
              onChange={(event) => set("status", event.target.value as AppraisalStatus)}
            >
              {APPRAISAL_STATUS.map((status) => (
                <option key={status} value={status}>
                  {APPRAISAL_STATUS_LABELS[status]}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField
            label="Oferta vale até"
            htmlFor="av-valid"
            hint="Preço de usado envelhece; sem prazo a oferta vira dívida"
          >
            <Input
              id="av-valid"
              type="date"
              value={draft.validUntil ? draft.validUntil.slice(0, 10) : ""}
              onChange={(event) =>
                set(
                  "validUntil",
                  event.target.value ? new Date(`${event.target.value}T12:00:00`).toISOString() : null,
                )
              }
            />
          </FormField>
        </div>

        <FormField label="Observações" htmlFor="av-notes" className="mb-0">
          <Textarea
            id="av-notes"
            rows={3}
            value={draft.notes ?? ""}
            onChange={(event) => set("notes", event.target.value)}
            placeholder="Pneus dianteiros gastos, revisão em dia, único dono."
          />
        </FormField>
      </form>
    </Dialog>
  );
}

function Figure({
  label,
  value,
  hint,
  alert,
  danger,
}: {
  label: string;
  value: string;
  hint?: string;
  alert?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="label-instrument text-muted">{label}</p>
      <p
        className={
          danger
            ? "odometer text-base text-danger"
            : alert
              ? "odometer text-base text-warning"
              : "odometer text-base text-text"
        }
      >
        {value}
      </p>
      {hint ? <p className="text-xs text-faint">{hint}</p> : null}
    </div>
  );
}
