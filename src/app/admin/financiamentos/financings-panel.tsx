"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm";
import { Dialog } from "@/components/ui/dialog";
import { FormField, Input, Select, Textarea } from "@/components/ui/field";
import { maskPhone } from "@carbud/site-kit/masks";
import { EmptyState, Table, Td, Th, Thead, Tr } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { FINANCING_STATUS, type FinancingStatus } from "@/db/schema";
import { FINANCING_STATUS_LABELS } from "@/lib/catalog/labels";
import { apiDelete, apiPatch, apiPost, fieldErrorsFrom, type FieldErrors } from "@/lib/client/api";
import { formatCurrency, formatDate } from "@/lib/utils";
import { CurrencyInput, IntegerInput } from "@/components/ui/number-field";
import { centsToCurrencyInput, parseCurrencyToCents } from "@/lib/format/number-input";

export type FinancingRow = {
  id: string;
  customerName: string;
  customerPhone: string | null;
  vehicleLabel: string | null;
  bank: string | null;
  vehiclePriceCents: number;
  downPaymentCents: number;
  financedCents: number;
  installments: number;
  installmentCents: number;
  status: FinancingStatus;
  notes: string | null;
  createdAt: string;
};

const TONES: Record<FinancingStatus, BadgeTone> = {
  rascunho: "neutral",
  em_analise: "warning",
  aprovado: "success",
  recusado: "danger",
  contratado: "success",
  cancelado: "neutral",
};

const toCents = parseCurrencyToCents;
const toInput = centsToCurrencyInput;

function emptyRow(): FinancingRow {
  return {
    id: "",
    customerName: "",
    customerPhone: "",
    vehicleLabel: "",
    bank: "",
    vehiclePriceCents: 0,
    downPaymentCents: 0,
    financedCents: 0,
    installments: 48,
    installmentCents: 0,
    status: "em_analise",
    notes: "",
    createdAt: new Date().toISOString(),
  };
}

export function FinancingsPanel({
  financings,
  canWrite,
}: {
  financings: FinancingRow[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<FinancingRow | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(row: FinancingRow) {
    const confirmed = await confirm({
      title: "Excluir proposta",
      description: `A proposta de ${row.customerName} é apagada. Não dá para desfazer.`,
      confirmLabel: "Excluir proposta",
      tone: "danger",
    });
    if (!confirmed) return;

    setDeletingId(row.id);
    const result = await apiDelete(`/api/admin/financings/${row.id}`);
    setDeletingId(null);

    if (!result.ok) {
      toast.error("Não consegui excluir", result.error);
      return;
    }
    toast.success("Proposta excluída");
    router.refresh();
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Propostas</CardTitle>
            <CardDescription>
              Controle do que foi enviado a cada banco e em que pé está. O valor financiado é
              calculado a partir do preço e da entrada.
            </CardDescription>
          </div>
          {canWrite ? (
            <Button type="button" className="shrink-0" onClick={() => setEditing(emptyRow())}>
              <Plus className="h-3.5 w-3.5" />
              Nova proposta
            </Button>
          ) : null}
        </CardHeader>

        {financings.length === 0 ? (
          <EmptyState
            title="Nenhuma proposta"
            description="Registre a primeira para acompanhar a resposta do banco."
          />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Cliente</Th>
                <Th>Veículo</Th>
                <Th>Banco</Th>
                <Th numeric>Financiado</Th>
                <Th numeric>Parcelas</Th>
                <Th>Situação</Th>
                <Th numeric>Criada em</Th>
                <Th />
              </Tr>
            </Thead>
            <tbody>
              {financings.map((row) => (
                <Tr key={row.id}>
                  <Td>
                    <div className="font-medium text-text">{row.customerName}</div>
                    {row.customerPhone ? (
                      <div className="text-xs text-faint">{row.customerPhone}</div>
                    ) : null}
                  </Td>
                  <Td>{row.vehicleLabel || "—"}</Td>
                  <Td>{row.bank || "—"}</Td>
                  <Td numeric>{formatCurrency(row.financedCents)}</Td>
                  <Td numeric>
                    {row.installments > 0
                      ? `${row.installments}x ${formatCurrency(row.installmentCents)}`
                      : "—"}
                  </Td>
                  <Td>
                    <Badge tone={TONES[row.status]}>{FINANCING_STATUS_LABELS[row.status]}</Badge>
                  </Td>
                  <Td numeric>{formatDate(new Date(row.createdAt))}</Td>
                  <Td>
                    {canWrite ? (
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditing(row)}
                          aria-label={`Editar proposta de ${row.customerName}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          loading={deletingId === row.id}
                          onClick={() => handleDelete(row)}
                          aria-label={`Excluir proposta de ${row.customerName}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : null}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {editing ? (
        <FinancingEditor
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

function FinancingEditor({
  row,
  onClose,
  onSaved,
}: {
  row: FinancingRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const isNew = !row.id;
  const [draft, setDraft] = useState(row);
  const [price, setPrice] = useState(toInput(row.vehiclePriceCents));
  const [down, setDown] = useState(toInput(row.downPaymentCents));
  const [installment, setInstallment] = useState(toInput(row.installmentCents));
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  // as contas aparecem enquanto a pessoa digita: é onde o erro de digitação
  // fica evidente antes de a proposta ir para o banco
  const math = useMemo(() => {
    const priceCents = toCents(price);
    const downCents = toCents(down);
    const installmentCents = toCents(installment);
    const financed = Math.max(0, priceCents - downCents);
    const total = downCents + draft.installments * installmentCents;
    return { financed, total, cost: Math.max(0, total - priceCents) };
  }, [price, down, installment, draft.installments]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setErrors({});

    const payload = {
      customerName: draft.customerName.trim(),
      customerPhone: draft.customerPhone?.trim() || null,
      vehicleLabel: draft.vehicleLabel?.trim() || null,
      bank: draft.bank?.trim() || null,
      vehiclePriceCents: toCents(price),
      downPaymentCents: toCents(down),
      installments: Number(draft.installments) || 0,
      installmentCents: toCents(installment),
      status: draft.status,
      notes: draft.notes?.trim() || null,
    };

    const result = isNew
      ? await apiPost("/api/admin/financings", payload)
      : await apiPatch(`/api/admin/financings/${draft.id}`, payload);

    setSaving(false);

    if (!result.ok) {
      setErrors(fieldErrorsFrom(result.details));
      toast.error(isNew ? "Não consegui criar" : "Não consegui salvar", result.error);
      return;
    }
    toast.success(isNew ? "Proposta criada" : "Proposta salva");
    onSaved();
  }

  return (
    <Dialog
      open
      size="md"
      onClose={onClose}
      title={isNew ? "Nova proposta" : `Proposta de ${row.customerName}`}
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="financing-form" loading={saving}>
            {isNew ? "Criar proposta" : "Salvar"}
          </Button>
        </div>
      }
    >
      <form id="financing-form" onSubmit={handleSubmit} noValidate>
        <div className="grid gap-x-4 sm:grid-cols-2">
          <FormField label="Cliente" htmlFor="fin-name" error={errors.customerName}>
            <Input
              id="fin-name"
              required
              value={draft.customerName}
              onChange={(event) => setDraft({ ...draft, customerName: event.target.value })}
            />
          </FormField>
          <FormField label="Telefone" htmlFor="fin-phone">
            <Input
              id="fin-phone"
              inputMode="tel"
              mask={maskPhone}
              value={draft.customerPhone ?? ""}
              onChange={(event) => setDraft({ ...draft, customerPhone: event.target.value })}
            />
          </FormField>
          <FormField label="Veículo" htmlFor="fin-vehicle">
            <Input
              id="fin-vehicle"
              value={draft.vehicleLabel ?? ""}
              onChange={(event) => setDraft({ ...draft, vehicleLabel: event.target.value })}
              placeholder="Onix 1.0 LT 2022"
            />
          </FormField>
          <FormField label="Banco" htmlFor="fin-bank">
            <Input
              id="fin-bank"
              value={draft.bank ?? ""}
              onChange={(event) => setDraft({ ...draft, bank: event.target.value })}
              placeholder="Santander"
            />
          </FormField>
        </div>

        <div className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-4">
          <FormField label="Preço (R$)" htmlFor="fin-price" error={errors.vehiclePriceCents}>
            <CurrencyInput
              id="fin-price"
              valueCents={toCents(price)}
              onChangeCents={(cents) => setPrice(toInput(cents))}
            />
          </FormField>
          <FormField label="Entrada (R$)" htmlFor="fin-down">
            <CurrencyInput
              id="fin-down"
              valueCents={toCents(down)}
              onChangeCents={(cents) => setDown(toInput(cents))}
            />
          </FormField>
          <FormField label="Parcelas" htmlFor="fin-installments">
            <IntegerInput
              id="fin-installments"
              value={draft.installments}
              onChangeNumber={(next) => setDraft({ ...draft, installments: next })}
            />
          </FormField>
          <FormField label="Valor da parcela (R$)" htmlFor="fin-installment">
            <CurrencyInput
              id="fin-installment"
              valueCents={toCents(installment)}
              onChangeCents={(cents) => setInstallment(toInput(cents))}
            />
          </FormField>
        </div>

        <div className="mb-4 grid gap-3 rounded border border-border bg-surface-2 p-3 text-[13px] sm:grid-cols-3">
          <Summary label="Financiado" value={formatCurrency(math.financed)} />
          <Summary label="Total pago" value={formatCurrency(math.total)} />
          <Summary
            label="Custo do crédito"
            value={formatCurrency(math.cost)}
            hint="quanto passa do preço do carro"
          />
        </div>

        <div className="grid gap-x-4 sm:grid-cols-2">
          <FormField label="Situação" htmlFor="fin-status">
            <Select
              id="fin-status"
              value={draft.status}
              onChange={(event) =>
                setDraft({ ...draft, status: event.target.value as FinancingStatus })
              }
            >
              {FINANCING_STATUS.map((status) => (
                <option key={status} value={status}>
                  {FINANCING_STATUS_LABELS[status]}
                </option>
              ))}
            </Select>
          </FormField>
        </div>

        <FormField label="Observações" htmlFor="fin-notes" className="mb-0">
          <Textarea
            id="fin-notes"
            rows={3}
            value={draft.notes ?? ""}
            onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
            placeholder="Analista pediu comprovante de renda atualizado."
          />
        </FormField>
      </form>
    </Dialog>
  );
}

function Summary({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="label-instrument mb-0.5 text-muted">{label}</p>
      <p className="tabular-nums text-text">{value}</p>
      {hint ? <p className="text-xs text-faint">{hint}</p> : null}
    </div>
  );
}
