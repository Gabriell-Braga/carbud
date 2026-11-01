/*
 * Mesma conta da planilha da Dri-Car: receita = venda + retorno do banco;
 * custo = compra + despesas. Sem venda ou sem compra não há lucro a mostrar —
 * zero ali seria lido como "empatou", o que é mentira.
 */
export function computeMargin(input: {
  purchasePriceCents: number | null;
  salePriceCents: number | null;
  bankReturnCents: number | null;
  expensesCents: number;
}) {
  const costCents = (input.purchasePriceCents ?? 0) + input.expensesCents;
  if (input.salePriceCents == null || input.purchasePriceCents == null) {
    return { costCents, revenueCents: null, profitCents: null, marginPct: null };
  }
  const revenueCents = input.salePriceCents + (input.bankReturnCents ?? 0);
  const profitCents = revenueCents - costCents;
  const marginPct = revenueCents > 0 ? (profitCents / revenueCents) * 100 : null;
  return { costCents, revenueCents, profitCents, marginPct };
}
