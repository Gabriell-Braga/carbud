"use client";

import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, FormField, Input, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { apiPatch, apiPost, errorMessageFrom, fieldErrorsFrom, type FieldErrors } from "@/lib/client/api";
import { CurrencyInput } from "@/components/ui/number-field";
import { centsToCurrencyInput, parseCurrencyToCents } from "@/lib/format/number-input";
import {
  FEATURE_GROUPS,
  FEATURES,
  LIMITS,
  isFeatureOn,
  unreadyFeatures,
  type FeatureDefinition,
} from "@/lib/plans/catalog";

export type PlanRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  priceCents: number;
  cycle: string;
  billingMode: string;
  trialDays: number;
  limits: Record<string, number | null> | null;
  features: Record<string, unknown> | null;
  publicVisible: boolean;
  highlighted: boolean;
  active: boolean;
  sortOrder: number;
  tenantCount: number;
};

const STATUS_NOTE: Record<string, string> = {
  em_construcao: "Em construção: ligar aqui ainda não entrega nada à revenda.",
  depende_de_fornecedor: "Depende de fornecedor externo.",
};

function emptyPlan(): PlanRow {
  return {
    id: "",
    name: "",
    slug: "",
    description: "",
    priceCents: 0,
    cycle: "MONTHLY",
    billingMode: "gateway",
    trialDays: 0,
    limits: {},
    features: {},
    publicVisible: true,
    highlighted: false,
    active: true,
    sortOrder: 0,
    tenantCount: 0,
  };
}

const toCents = parseCurrencyToCents;

export function PlanEditor({
  plan,
  onClose,
  onSaved,
}: {
  plan: PlanRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const isNew = !plan;
  const [draft, setDraft] = useState<PlanRow>(plan ?? emptyPlan());
  const [priceText, setPriceText] = useState(
    plan ? centsToCurrencyInput(plan.priceCents) : "0,00",
  );
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const features = useMemo(
    () => (draft.features ?? {}) as Record<string, unknown>,
    [draft.features],
  );
  const limits = (draft.limits ?? {}) as Record<string, number | null>;

  const unready = useMemo(() => unreadyFeatures(features), [features]);

  function setFeature(key: string, value: unknown) {
    setDraft((current) => ({
      ...current,
      features: { ...(current.features ?? {}), [key]: value },
    }));
  }

  function setLimit(key: string, value: string) {
    setDraft((current) => ({
      ...current,
      limits: { ...(current.limits ?? {}), [key]: value === "" ? null : Number(value) },
    }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setErrors({});

    // limpa chaves vazias: o schema aceita ausente, não string vazia
    const cleanFeatures: Record<string, unknown> = {};
    for (const feature of FEATURES) {
      const value = features[feature.key];
      if (value === undefined || value === null || value === "") continue;
      cleanFeatures[feature.key] = value;
    }

    const payload = {
      name: draft.name.trim(),
      slug: draft.slug.trim(),
      description: draft.description?.trim() || null,
      priceCents: toCents(priceText),
      cycle: draft.cycle,
      billingMode: draft.billingMode,
      trialDays: Number(draft.trialDays) || 0,
      limits,
      features: cleanFeatures,
      publicVisible: draft.publicVisible,
      highlighted: draft.highlighted,
      active: draft.active,
      sortOrder: Number(draft.sortOrder) || 0,
    };

    const result = isNew
      ? await apiPost("/api/super-admin/plans", payload)
      : await apiPatch(`/api/super-admin/plans/${draft.id}`, payload);

    setSaving(false);

    if (!result.ok) {
      setErrors(fieldErrorsFrom(result.details));
      // "Dados inválidos" sozinho não diz qual campo; vários nem têm onde aparecer
      toast.error(isNew ? "Não foi possível criar" : "Não foi possível salvar", errorMessageFrom(result));
      return;
    }

    toast.success(isNew ? "Plano criado" : "Plano salvo", draft.name);
    onSaved();
  }

  return (
    <Dialog
      open
      size="lg"
      onClose={onClose}
      title={isNew ? "Novo plano" : `Editar ${plan?.name}`}
      description={
        plan && plan.tenantCount > 0
          ? `${plan.tenantCount} revenda(s) neste plano sentem limites e funcionalidades na hora.`
          : undefined
      }
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="plan-form" loading={saving}>
            {isNew ? "Criar plano" : "Salvar"}
          </Button>
        </div>
      }
    >
      <form id="plan-form" onSubmit={handleSubmit} noValidate>
        <div className="grid gap-x-4 sm:grid-cols-2">
          <FormField label="Nome" htmlFor="plan-name" error={errors.name}>
            <Input
              id="plan-name"
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              required
            />
          </FormField>

          <FormField
            label="Identificador"
            htmlFor="plan-slug"
            hint="Aparece na URL e no cupom. Minúsculas e hífen."
            error={errors.slug}
          >
            <Input
              id="plan-slug"
              value={draft.slug}
              onChange={(event) => setDraft({ ...draft, slug: event.target.value })}
              required
            />
          </FormField>
        </div>

        <FormField label="Descrição" htmlFor="plan-description" error={errors.description}>
          <Textarea
            id="plan-description"
            rows={2}
            value={draft.description ?? ""}
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
          />
        </FormField>

        <div className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-4">
          <FormField label="Preço (R$)" htmlFor="plan-price" error={errors.priceCents}>
            <CurrencyInput
              id="plan-price"
              valueCents={toCents(priceText)}
              onChangeCents={(cents) => setPriceText(centsToCurrencyInput(cents))}
            />
          </FormField>

          <FormField label="Ciclo" htmlFor="plan-cycle" error={errors.cycle}>
            <Select
              id="plan-cycle"
              value={draft.cycle}
              onChange={(event) => setDraft({ ...draft, cycle: event.target.value })}
            >
              <option value="MONTHLY">Mensal</option>
              <option value="QUARTERLY">Trimestral</option>
              <option value="SEMIANNUALLY">Semestral</option>
              <option value="YEARLY">Anual</option>
            </Select>
          </FormField>

          <FormField
            label="Cobrança"
            htmlFor="plan-mode"
            hint={
              draft.billingMode === "manual"
                ? "Nada é criado no gateway."
                : "Assinatura criada no Asaas."
            }
            error={errors.billingMode}
          >
            <Select
              id="plan-mode"
              value={draft.billingMode}
              onChange={(event) => setDraft({ ...draft, billingMode: event.target.value })}
            >
              <option value="gateway">Automática (gateway)</option>
              <option value="manual">Negociada (fora do gateway)</option>
            </Select>
          </FormField>

          <FormField
            label="Trial (dias)"
            htmlFor="plan-trial"
            hint="0 usa o padrão das configurações."
            error={errors.trialDays}
          >
            <Input
              id="plan-trial"
              type="number"
              min={0}
              max={365}
              value={draft.trialDays}
              onChange={(event) => setDraft({ ...draft, trialDays: Number(event.target.value) })}
            />
          </FormField>
        </div>

        {/* ---------------------------------------------------------- limites */}
        <fieldset className="mb-4 border-t border-border pt-4">
          <legend className="label-instrument mb-3 text-muted">Limites</legend>
          <p className="mb-3 text-xs text-faint">Campo vazio significa ilimitado.</p>
          <div className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
            {LIMITS.map((limit) => (
              <FormField
                key={limit.key}
                label={limit.label}
                htmlFor={`limit-${limit.key}`}
                hint={limit.hint}
              >
                <Input
                  id={`limit-${limit.key}`}
                  type="number"
                  min={0}
                  placeholder="Ilimitado"
                  value={limits[limit.key] ?? ""}
                  onChange={(event) => setLimit(limit.key, event.target.value)}
                />
              </FormField>
            ))}
          </div>
        </fieldset>

        {/* --------------------------------------------------- funcionalidades */}
        <fieldset className="mb-4 border-t border-border pt-4">
          <legend className="label-instrument mb-3 text-muted">Funcionalidades</legend>

          {unready.length > 0 ? (
            <Alert tone="warning" className="mb-4">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>
                {unready.length} funcionalidade(s) ligadas ainda não existem:{" "}
                {unready.map((feature) => feature.label).join(", ")}. Vender isso agora cria
                promessa que o produto não cumpre.
              </span>
            </Alert>
          ) : null}

          {FEATURE_GROUPS.map((group) => {
            const groupFeatures = FEATURES.filter((feature) => feature.group === group);
            if (groupFeatures.length === 0) return null;

            return (
              <div key={group} className="mb-5">
                <h4 className="label-instrument mb-2 text-faint">{group}</h4>
                <div className="grid gap-x-4 sm:grid-cols-2">
                  {groupFeatures.map((feature) => (
                    <FeatureControl
                      key={feature.key}
                      feature={feature}
                      value={features[feature.key]}
                      onChange={(value) => setFeature(feature.key, value)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </fieldset>

        {/* --------------------------------------------------------- exibição */}
        <fieldset className="border-t border-border pt-4">
          <legend className="label-instrument mb-3 text-muted">Exibição</legend>
          <div className="grid gap-x-4 sm:grid-cols-2">
            <FormField label="Ordem" htmlFor="plan-order" hint="Menor aparece primeiro.">
              <Input
                id="plan-order"
                type="number"
                min={0}
                value={draft.sortOrder}
                onChange={(event) => setDraft({ ...draft, sortOrder: Number(event.target.value) })}
              />
            </FormField>

            <div className="mb-4 flex flex-col justify-center gap-2 pt-5">
              <label className="flex items-center gap-2 text-[13px] text-text">
                <Checkbox
                  checked={draft.active}
                  onChange={(event) => setDraft({ ...draft, active: event.target.checked })}
                />
                Ativo
              </label>
              <label className="flex items-center gap-2 text-[13px] text-text">
                <Checkbox
                  checked={draft.publicVisible}
                  onChange={(event) => setDraft({ ...draft, publicVisible: event.target.checked })}
                />
                Visível na vitrine de contratação
              </label>
              <label className="flex items-center gap-2 text-[13px] text-text">
                <Checkbox
                  checked={draft.highlighted}
                  onChange={(event) => setDraft({ ...draft, highlighted: event.target.checked })}
                />
                Destacar como recomendado
              </label>
            </div>
          </div>
        </fieldset>
      </form>
    </Dialog>
  );
}

function FeatureControl({
  feature,
  value,
  onChange,
}: {
  feature: FeatureDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const note = feature.note ?? STATUS_NOTE[feature.status];

  if (feature.kind === "boolean") {
    return (
      <div className="mb-3">
        <label className="flex items-start gap-2 text-[13px] text-text">
          <Checkbox
            className="mt-0.5"
            checked={isFeatureOn(value)}
            onChange={(event) => onChange(event.target.checked)}
          />
          <span>
            {feature.label}
            {feature.status !== "pronto" ? (
              <span className="ml-1.5 text-[11px] uppercase tracking-wide text-warning">
                {feature.status === "em_construcao" ? "em construção" : "externo"}
              </span>
            ) : null}
            {note ? <span className="block text-xs text-faint">{note}</span> : null}
          </span>
        </label>
      </div>
    );
  }

  if (feature.kind === "number") {
    return (
      <FormField label={feature.label} htmlFor={`feature-${feature.key}`} hint={note}>
        <Input
          id={`feature-${feature.key}`}
          type="number"
          min={0}
          placeholder="Não incluso"
          value={(value as number | null) ?? ""}
          onChange={(event) =>
            onChange(event.target.value === "" ? null : Number(event.target.value))
          }
        />
      </FormField>
    );
  }

  return (
    <FormField label={feature.label} htmlFor={`feature-${feature.key}`} hint={note}>
      <Select
        id={`feature-${feature.key}`}
        value={(value as string | null) ?? ""}
        onChange={(event) => onChange(event.target.value || null)}
      >
        <option value="">Não incluso</option>
        {feature.tiers.map((tier) => (
          <option key={tier.value} value={tier.value}>
            {tier.label}
          </option>
        ))}
      </Select>
    </FormField>
  );
}

