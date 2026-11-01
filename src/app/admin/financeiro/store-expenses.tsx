"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm";
import { FormField, Input, Select } from "@/components/ui/field";
import { CurrencyInput } from "@/components/ui/number-field";
import { useToast } from "@/components/ui/toast";
import { apiDelete, apiPost } from "@/lib/client/api";
import { STORE_EXPENSE_CATEGORIES } from "@/lib/validation/finance";
import { formatCurrency } from "@/lib/utils";

export type StoreExpenseItem = {
  id: string;
  category: string;
  description: string | null;
  amountCents: number;
  date: string;
};

const today = () => new Date().toISOString().slice(0, 10);
const formatDay = (value: string) => value.split("-").reverse().join("/");

/** Aluguel, salário, luz: o que a loja gasta sem ser por carro. */
export function StoreExpenses({
  items,
  totalCents,
  periodLabel,
  readOnly,
}: {
  items: StoreExpenseItem[];
  totalCents: number;
  periodLabel: string;
  readOnly: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [expense, setExpense] = useState({
    category: STORE_EXPENSE_CATEGORIES[0] as string,
    description: "",
    amountCents: 0,
    date: today(),
  });
  const [adding, setAdding] = useState(false);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setAdding(true);
    const result = await apiPost("/api/admin/finance/expenses", expense);
    setAdding(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setExpense((current) => ({ ...current, description: "", amountCents: 0 }));
    router.refresh();
  }

  async function remove(item: StoreExpenseItem) {
    const confirmed = await confirm({
      title: "Excluir custo fixo",
      description: `${item.category} de ${formatCurrency(item.amountCents)} em ${formatDay(item.date)} sai da conta.`,
      confirmLabel: "Excluir",
      tone: "danger",
    });
    if (!confirmed) return;
    const result = await apiDelete(`/api/admin/finance/expenses/${item.id}`);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <Card className="mt-3">
      <CardHeader>
        <CardTitle>Custos fixos da loja</CardTitle>
        <CardDescription>
          Aluguel, salários, contas. {periodLabel}: {formatCurrency(totalCents)}. Use a data do vencimento
          ou do pagamento; o filtro de datas acima vale aqui também.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {readOnly ? null : (
          <form
            onSubmit={add}
            className="grid grid-cols-1 items-end gap-x-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
          >
            <FormField label="Categoria" htmlFor="store-exp-category">
              <Select
                id="store-exp-category"
                value={expense.category}
                onChange={(event) => setExpense((current) => ({ ...current, category: event.target.value }))}
              >
                {STORE_EXPENSE_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Descrição" htmlFor="store-exp-description">
              <Input
                id="store-exp-description"
                maxLength={200}
                placeholder="Ex.: salário João, aluguel outubro"
                value={expense.description}
                onChange={(event) => setExpense((current) => ({ ...current, description: event.target.value }))}
              />
            </FormField>
            <FormField label="Valor (R$)" htmlFor="store-exp-amount">
              <CurrencyInput
                id="store-exp-amount"
                valueCents={expense.amountCents}
                onChangeCents={(cents) => setExpense((current) => ({ ...current, amountCents: cents }))}
              />
            </FormField>
            <FormField label="Data" htmlFor="store-exp-date">
              <Input
                id="store-exp-date"
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

        {items.length === 0 ? (
          <p className="text-sm text-muted">Nenhum custo fixo neste período.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {items.map((item) => (
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
                    onClick={() => remove(item)}
                    className="grid h-7 w-7 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-danger"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
