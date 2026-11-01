"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Accordion } from "@/components/ui/accordion";
import { useConfirm } from "@/components/ui/confirm";
import { FormField, Input, Select, Textarea } from "@/components/ui/field";
import { CurrencyInput } from "@/components/ui/number-field";
import { useToast } from "@/components/ui/toast";
import { apiDelete, apiPost, apiPut } from "@/lib/client/api";
import { computeMargin } from "@/lib/services/vehicle-finance-math";
import { EXPENSE_CATEGORIES } from "@/lib/validation/finance";
import { cn, formatCurrency } from "@/lib/utils";

export type FinanceValues = {
  purchasePriceCents: number;
  purchaseDate: string;
  purchaseSource: string;
  salePriceCents: number;
  saleDate: string;
  buyerName: string;
  buyerDocument: string;
  buyerPhone: string;
  bankReturnCents: number;
  notes: string;
};

export type ExpenseItem = {
  id: string;
  category: string;
  description: string | null;
  amountCents: number;
  date: string;
};

const today = () => new Date().toISOString().slice(0, 10);
const formatDay = (value: string) => value.split("-").reverse().join("/");

/**
 * Compra, custos, venda e margem do carro — só para quem tem `finance:read`.
 * Zero nos valores vale como "não informado": nenhum carro é comprado ou
 * vendido por R$ 0, e tratar zero como valor faria a margem mentir.
 */
export function FinanceCard({
  vehicleId,
  readOnly,
  adPriceCents,
  initial,
  expenses,
}: {
  vehicleId: string;
  readOnly: boolean;
  adPriceCents: number;
  initial: FinanceValues;
  expenses: ExpenseItem[];
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [expense, setExpense] = useState({
    category: EXPENSE_CATEGORIES[0] as string,
    description: "",
    amountCents: 0,
    date: today(),
  });
  const [adding, setAdding] = useState(false);

  const update = <K extends keyof FinanceValues>(key: K, value: FinanceValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const expensesCents = expenses.reduce((sum, item) => sum + item.amountCents, 0);
  const margin = computeMargin({
    purchasePriceCents: values.purchasePriceCents || null,
    salePriceCents: values.salePriceCents || null,
    bankReturnCents: values.bankReturnCents || null,
    expensesCents,
  });

  async function save() {
    setSaving(true);
    const result = await apiPut(`/api/admin/vehicles/${vehicleId}/finance`, {
      ...values,
      purchasePriceCents: values.purchasePriceCents || null,
      salePriceCents: values.salePriceCents || null,
      bankReturnCents: values.bankReturnCents || null,
    });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Financeiro do veículo salvo.");
    router.refresh();
  }

  async function addExpense(event: React.FormEvent) {
    event.preventDefault();
    setAdding(true);
    const result = await apiPost(`/api/admin/vehicles/${vehicleId}/finance`, expense);
    setAdding(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setExpense((current) => ({ ...current, description: "", amountCents: 0 }));
    router.refresh();
  }

  async function removeExpense(item: ExpenseItem) {
    const confirmed = await confirm({
      title: "Excluir custo",
      description: `${item.category} de ${formatCurrency(item.amountCents)} sai da conta deste carro.`,
      confirmLabel: "Excluir",
      tone: "danger",
    });
    if (!confirmed) return;
    const result = await apiDelete(`/api/admin/vehicles/${vehicleId}/finance/${item.id}`);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <Accordion
      title="Financeiro do veículo"
      defaultOpen={false}
      summary={margin.profitCents == null ? `Custo ${formatCurrency(margin.costCents)}` : `Lucro ${formatCurrency(margin.profitCents)}`}
    >
        <p className="mb-4 text-sm text-muted">
          Compra, custos e venda. Só a loja vê; nada disso vai para o site ou para os portais.
        </p>
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Summary label="Custo total" value={formatCurrency(margin.costCents)} hint={`compra + ${expenses.length} custo(s)`} />
          <Summary
            label="Receita"
            value={margin.revenueCents == null ? "—" : formatCurrency(margin.revenueCents)}
            hint="venda + retorno do banco"
          />
          <Summary
            label="Lucro"
            value={margin.profitCents == null ? "—" : formatCurrency(margin.profitCents)}
            tone={margin.profitCents == null ? undefined : margin.profitCents >= 0 ? "success" : "danger"}
          />
          <Summary
            label="Margem"
            value={margin.marginPct == null ? "—" : `${margin.marginPct.toFixed(1).replace(".", ",")}%`}
            hint={margin.profitCents == null ? "preencha compra e venda" : undefined}
          />
        </div>

        <section>
          <p className="label-instrument mb-3 text-faint">Compra</p>
          <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-3">
            <FormField label="Valor de compra (R$)" htmlFor="fin-purchase">
              <CurrencyInput
                id="fin-purchase"
                disabled={readOnly}
                valueCents={values.purchasePriceCents}
                onChangeCents={(cents) => update("purchasePriceCents", cents)}
              />
            </FormField>
            <FormField label="Data de entrada" htmlFor="fin-purchase-date">
              <Input
                id="fin-purchase-date"
                type="date"
                disabled={readOnly}
                value={values.purchaseDate}
                onChange={(event) => update("purchaseDate", event.target.value)}
              />
            </FormField>
            <FormField label="De onde veio" htmlFor="fin-source" hint="Leilão, troca, particular, outra loja…">
              <Input
                id="fin-source"
                disabled={readOnly}
                maxLength={120}
                value={values.purchaseSource}
                onChange={(event) => update("purchaseSource", event.target.value)}
              />
            </FormField>
          </div>
        </section>

        <section>
          <p className="label-instrument mb-3 text-faint">Venda</p>
          <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-3">
            <FormField
              label="Valor de venda (R$)"
              htmlFor="fin-sale"
              hint={adPriceCents > 0 ? `Anunciado por ${formatCurrency(adPriceCents)}` : undefined}
            >
              <CurrencyInput
                id="fin-sale"
                disabled={readOnly}
                valueCents={values.salePriceCents}
                onChangeCents={(cents) => update("salePriceCents", cents)}
              />
            </FormField>
            <FormField label="Data da venda" htmlFor="fin-sale-date">
              <Input
                id="fin-sale-date"
                type="date"
                disabled={readOnly}
                value={values.saleDate}
                onChange={(event) => update("saleDate", event.target.value)}
              />
            </FormField>
            <FormField label="Retorno do banco (R$)" htmlFor="fin-bank" hint="Comissão do financiamento">
              <CurrencyInput
                id="fin-bank"
                disabled={readOnly}
                valueCents={values.bankReturnCents}
                onChangeCents={(cents) => update("bankReturnCents", cents)}
              />
            </FormField>
            <FormField label="Comprador" htmlFor="fin-buyer">
              <Input
                id="fin-buyer"
                disabled={readOnly}
                maxLength={120}
                value={values.buyerName}
                onChange={(event) => update("buyerName", event.target.value)}
              />
            </FormField>
            <FormField label="CPF/CNPJ do comprador" htmlFor="fin-doc">
              <Input
                id="fin-doc"
                disabled={readOnly}
                maxLength={20}
                value={values.buyerDocument}
                onChange={(event) => update("buyerDocument", event.target.value)}
              />
            </FormField>
            <FormField label="Telefone do comprador" htmlFor="fin-phone">
              <Input
                id="fin-phone"
                type="tel"
                disabled={readOnly}
                maxLength={30}
                value={values.buyerPhone}
                onChange={(event) => update("buyerPhone", event.target.value)}
              />
            </FormField>
          </div>
          <FormField label="Observações" htmlFor="fin-notes">
            <Textarea
              id="fin-notes"
              rows={2}
              disabled={readOnly}
              maxLength={2000}
              value={values.notes}
              onChange={(event) => update("notes", event.target.value)}
            />
          </FormField>
          {readOnly ? null : (
            <Button type="button" loading={saving} onClick={save}>
              Salvar compra e venda
            </Button>
          )}
        </section>

        <section>
          <p className="label-instrument mb-3 text-faint">
            Custos {expenses.length > 0 ? `· ${formatCurrency(expensesCents)}` : ""}
          </p>
          {expenses.length === 0 ? (
            <p className="mb-3 text-sm text-muted">Nenhum custo lançado.</p>
          ) : (
            <ul className="mb-4 divide-y divide-border rounded-lg border border-border">
              {expenses.map((item) => (
                <li key={item.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="tnum w-20 shrink-0 text-xs text-muted">{formatDay(item.date)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="font-medium text-text">{item.category}</span>
                    {item.description ? (
                      <span className="block truncate text-xs text-faint">{item.description}</span>
                    ) : null}
                  </span>
                  <span className="tnum font-medium">{formatCurrency(item.amountCents)}</span>
                  {readOnly ? null : (
                    <button
                      type="button"
                      aria-label={`Excluir custo ${item.category}`}
                      onClick={() => removeExpense(item)}
                      className="grid h-7 w-7 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-danger"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {readOnly ? null : (
            <form
              onSubmit={addExpense}
              className="grid grid-cols-1 items-end gap-x-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
            >
              <FormField label="Categoria" htmlFor="exp-category">
                <Select
                  id="exp-category"
                  value={expense.category}
                  onChange={(event) => setExpense((current) => ({ ...current, category: event.target.value }))}
                >
                  {EXPENSE_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Descrição" htmlFor="exp-description">
                <Input
                  id="exp-description"
                  maxLength={200}
                  value={expense.description}
                  onChange={(event) => setExpense((current) => ({ ...current, description: event.target.value }))}
                />
              </FormField>
              <FormField label="Valor (R$)" htmlFor="exp-amount">
                <CurrencyInput
                  id="exp-amount"
                  valueCents={expense.amountCents}
                  onChangeCents={(cents) => setExpense((current) => ({ ...current, amountCents: cents }))}
                />
              </FormField>
              <FormField label="Data" htmlFor="exp-date">
                <Input
                  id="exp-date"
                  type="date"
                  required
                  value={expense.date}
                  onChange={(event) => setExpense((current) => ({ ...current, date: event.target.value }))}
                />
              </FormField>
              <Button type="submit" variant="secondary" loading={adding} className="mb-4">
                Lançar custo
              </Button>
            </form>
          )}
        </section>
      </div>
    </Accordion>
  );
}

function Summary({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "success" | "danger";
}) {
  return (
    <div className="rounded-lg border border-border px-3 py-2.5">
      <p className="text-xs text-muted">{label}</p>
      <p
        className={cn(
          "tnum text-base font-semibold",
          tone === "success" && "text-success",
          tone === "danger" && "text-danger",
        )}
      >
        {value}
      </p>
      {hint ? <p className="text-[11px] text-faint">{hint}</p> : null}
    </div>
  );
}
