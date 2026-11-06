"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, FormField, Input, Select, Textarea } from "@/components/ui/field";
import { EmptyState, Table, Td, Th, Thead, Tr } from "@/components/ui/table";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { apiDelete, apiPatch, apiPost, fieldErrorsFrom, type FieldErrors } from "@/lib/client/api";
import { formatCurrency, formatDate } from "@/lib/utils";
import { CurrencyInput, IntegerInput } from "@/components/ui/number-field";
import { centsToCurrencyInput, parseCurrencyToCents } from "@/lib/format/number-input";
import type { PlanRow } from "./plan-editor";

export type CouponRow = {
  id: string;
  code: string;
  description: string | null;
  discountType: string;
  discountValue: number;
  firstPaymentCents: number | null;
  durationCycles: number | null;
  maxRedemptions: number | null;
  redemptions: number;
  planIds: string[] | null;
  expiresAt: string | null;
  active: boolean;
};

function emptyCoupon(): CouponRow {
  return {
    id: "",
    code: "",
    description: "",
    discountType: "PERCENTAGE",
    discountValue: 10,
    firstPaymentCents: null,
    durationCycles: null,
    maxRedemptions: null,
    redemptions: 0,
    planIds: [],
    expiresAt: null,
    active: true,
  };
}

function describeDiscount(coupon: CouponRow): string {
  const discount =
    coupon.discountValue === 0
      ? null
      : coupon.discountType === "PERCENTAGE"
        ? `${coupon.discountValue}%`
        : formatCurrency(coupon.discountValue);
  const first =
    coupon.firstPaymentCents === null
      ? null
      : `1º mês ${formatCurrency(coupon.firstPaymentCents)}`;
  return [first, discount].filter(Boolean).join(" + ");
}

export function CouponsPanel({ coupons, plans }: { coupons: CouponRow[]; plans: PlanRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<CouponRow | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(coupon: CouponRow) {
    const willDeactivate = coupon.redemptions > 0;
    const confirmed = await confirm(
      willDeactivate
        ? {
            title: "Desativar cupom",
            description: `"${coupon.code}" já foi usado ${coupon.redemptions}x, então ele é desativado em vez de excluído: quem está pagando com esse desconto continua com o registro.`,
            confirmLabel: "Desativar cupom",
          }
        : {
            title: "Excluir cupom",
            description: `"${coupon.code}" nunca foi usado e será apagado.`,
            confirmLabel: "Excluir cupom",
            tone: "danger",
          },
    );
    if (!confirmed) return;

    setDeletingId(coupon.id);
    const result = await apiDelete(`/api/super-admin/coupons/${coupon.id}`);
    setDeletingId(null);

    if (!result.ok) {
      toast.error("Não foi possível remover", result.error);
      return;
    }
    toast.success(willDeactivate ? "Cupom desativado" : "Cupom excluído", coupon.code);
    router.refresh();
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Cupons</CardTitle>
            <CardDescription>
              O Asaas não tem cupom, então na contratação o desconto vira o campo de desconto da
              assinatura. Mudar o cupom depois não altera quem já contratou. Para o cupom
              entrar sozinho no link de indicação, escolha-o no cadastro do afiliado. Sem cupom, o
              primeiro mês é cobrado pelo valor do plano.
            </CardDescription>
          </div>
          <Button type="button" onClick={() => setEditing(emptyCoupon())} className="shrink-0">
            <Plus className="h-3.5 w-3.5" />
            Novo cupom
          </Button>
        </CardHeader>

        {coupons.length === 0 ? (
          <EmptyState
            title="Nenhum cupom"
            description="Cupons servem para promoção e negociação pontual."
          />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Código</Th>
                <Th numeric>Desconto</Th>
                <Th numeric>Ciclos</Th>
                <Th numeric>Usos</Th>
                <Th>Planos</Th>
                <Th numeric>Expira</Th>
                <Th>Situação</Th>
                <Th />
              </Tr>
            </Thead>
            <tbody>
              {coupons.map((coupon) => (
                <Tr key={coupon.id}>
                  <Td>
                    <div className="font-medium text-text">{coupon.code}</div>
                    {coupon.description ? (
                      <div className="text-xs text-faint">{coupon.description}</div>
                    ) : null}
                  </Td>
                  <Td numeric>{describeDiscount(coupon)}</Td>
                  <Td numeric>{coupon.durationCycles ?? "sempre"}</Td>
                  <Td numeric>
                    {coupon.redemptions}
                    {coupon.maxRedemptions ? `/${coupon.maxRedemptions}` : ""}
                  </Td>
                  <Td>
                    {coupon.planIds?.length
                      ? plans
                          .filter((plan) => coupon.planIds?.includes(plan.id))
                          .map((plan) => plan.name)
                          .join(", ")
                      : "Todos"}
                  </Td>
                  <Td numeric>{coupon.expiresAt ? formatDate(new Date(coupon.expiresAt)) : "—"}</Td>
                  <Td>
                    <Badge tone={coupon.active ? "success" : "neutral"}>
                      {coupon.active ? "Ativo" : "Inativo"}
                    </Badge>
                  </Td>
                  <Td>
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditing(coupon)}
                        aria-label={`Editar ${coupon.code}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        loading={deletingId === coupon.id}
                        onClick={() => handleDelete(coupon)}
                        aria-label={`Remover ${coupon.code}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {editing ? (
        <CouponEditor
          coupon={editing}
          plans={plans}
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

function CouponEditor({
  coupon,
  plans,
  onClose,
  onSaved,
}: {
  coupon: CouponRow;
  plans: PlanRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const isNew = !coupon.id;
  const [draft, setDraft] = useState<CouponRow>(coupon);
  const [valueText, setValueText] = useState(
    coupon.discountType === "PERCENTAGE"
      ? String(coupon.discountValue)
      : (coupon.discountValue / 100).toFixed(2).replace(".", ","),
  );
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  function togglePlan(planId: string, checked: boolean) {
    setDraft((current) => {
      const ids = new Set(current.planIds ?? []);
      if (checked) ids.add(planId);
      else ids.delete(planId);
      return { ...current, planIds: [...ids] };
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setErrors({});

    const discountValue =
      draft.discountType === "PERCENTAGE"
        ? Math.round(Number(valueText.replace(",", ".")) || 0)
        : Math.round((Number(valueText.replace(/\./g, "").replace(",", ".")) || 0) * 100);

    const payload = {
      code: draft.code.trim().toUpperCase(),
      description: draft.description?.trim() || null,
      discountType: draft.discountType,
      discountValue,
      firstPaymentCents: draft.firstPaymentCents,
      durationCycles: draft.durationCycles,
      maxRedemptions: draft.maxRedemptions,
      planIds: draft.planIds ?? [],
      expiresAt: draft.expiresAt,
      active: draft.active,
    };

    const result = isNew
      ? await apiPost("/api/super-admin/coupons", payload)
      : await apiPatch(`/api/super-admin/coupons/${draft.id}`, payload);

    setSaving(false);

    if (!result.ok) {
      setErrors(fieldErrorsFrom(result.details));
      toast.error(isNew ? "Não foi possível criar" : "Não foi possível salvar", result.error);
      return;
    }

    toast.success(isNew ? "Cupom criado" : "Cupom salvo", payload.code);
    onSaved();
  }

  return (
    <Dialog
      open
      size="md"
      onClose={onClose}
      title={isNew ? "Novo cupom" : `Editar ${coupon.code}`}
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="coupon-form" loading={saving}>
            {isNew ? "Criar cupom" : "Salvar"}
          </Button>
        </div>
      }
    >
      <form id="coupon-form" onSubmit={handleSubmit} noValidate>
        <div className="grid gap-x-4 sm:grid-cols-2">
          <FormField label="Código" htmlFor="coupon-code" error={errors.code}>
            <Input
              id="coupon-code"
              value={draft.code}
              onChange={(event) => setDraft({ ...draft, code: event.target.value.toUpperCase() })}
              required
            />
          </FormField>

          <FormField label="Tipo" htmlFor="coupon-type" error={errors.discountType}>
            <Select
              id="coupon-type"
              value={draft.discountType}
              onChange={(event) => setDraft({ ...draft, discountType: event.target.value })}
            >
              <option value="PERCENTAGE">Percentual</option>
              <option value="FIXED">Valor fixo</option>
            </Select>
          </FormField>
        </div>

        <div className="grid gap-x-4 sm:grid-cols-3">
          <FormField
            label={draft.discountType === "PERCENTAGE" ? "Desconto (%)" : "Desconto (R$)"}
            htmlFor="coupon-value"
            error={errors.discountValue}
          >
            {/* percentual e valor sao numeros diferentes: um nao tem centavos */}
            {draft.discountType === "PERCENTAGE" ? (
              <IntegerInput
                id="coupon-value"
                value={Number(valueText.replace(/[^0-9]/g, "")) || 0}
                onChangeNumber={(next) => setValueText(String(next))}
              />
            ) : (
              <CurrencyInput
                id="coupon-value"
                valueCents={parseCurrencyToCents(valueText)}
                onChangeCents={(cents) => setValueText(centsToCurrencyInput(cents))}
              />
            )}
          </FormField>

          <FormField
            label="Ciclos"
            htmlFor="coupon-cycles"
            hint="Vazio = para sempre."
            error={errors.durationCycles}
          >
            <Input
              id="coupon-cycles"
              type="number"
              min={1}
              placeholder="Sempre"
              value={draft.durationCycles ?? ""}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  durationCycles: event.target.value === "" ? null : Number(event.target.value),
                })
              }
            />
          </FormField>

          <FormField
            label="Usos máximos"
            htmlFor="coupon-max"
            hint="Vazio = sem limite."
            error={errors.maxRedemptions}
          >
            <Input
              id="coupon-max"
              type="number"
              min={1}
              placeholder="Sem limite"
              value={draft.maxRedemptions ?? ""}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  maxRedemptions: event.target.value === "" ? null : Number(event.target.value),
                })
              }
            />
          </FormField>
        </div>

        <FormField
          label="Primeiro mês por (R$)"
          htmlFor="coupon-first"
          hint="Cobrado na hora, no cartão. Vazio = primeiro mês pelo valor do plano (com o desconto acima). Use desconto 0 para um cupom só de primeiro mês."
          error={errors.firstPaymentCents}
        >
          <CurrencyInput
            id="coupon-first"
            valueCents={draft.firstPaymentCents ?? 0}
            onChangeCents={(cents) => setDraft({ ...draft, firstPaymentCents: cents || null })}
          />
        </FormField>

        <FormField label="Descrição" htmlFor="coupon-description" error={errors.description}>
          <Textarea
            id="coupon-description"
            rows={2}
            value={draft.description ?? ""}
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
          />
        </FormField>

        <FormField label="Expira em" htmlFor="coupon-expires" hint="Vazio = não expira.">
          <Input
            id="coupon-expires"
            type="date"
            value={draft.expiresAt ? draft.expiresAt.slice(0, 10) : ""}
            onChange={(event) =>
              setDraft({
                ...draft,
                expiresAt: event.target.value
                  ? new Date(`${event.target.value}T12:00:00Z`).toISOString()
                  : null,
              })
            }
          />
        </FormField>

        <fieldset className="mb-4">
          <legend className="label-instrument mb-2 text-muted">Planos aceitos</legend>
          <p className="mb-2 text-xs text-faint">Nenhum marcado = vale para todos.</p>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {plans.map((plan) => (
              <label key={plan.id} className="flex items-center gap-2 text-[13px] text-text">
                <Checkbox
                  checked={draft.planIds?.includes(plan.id) ?? false}
                  onChange={(event) => togglePlan(plan.id, event.target.checked)}
                />
                {plan.name}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="flex items-center gap-2 text-[13px] text-text">
          <Checkbox
            checked={draft.active}
            onChange={(event) => setDraft({ ...draft, active: event.target.checked })}
          />
          Ativo
        </label>
      </form>
    </Dialog>
  );
}
