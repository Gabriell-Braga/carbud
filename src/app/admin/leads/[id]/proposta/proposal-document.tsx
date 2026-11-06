"use client";

import { useState } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormField, Input } from "@/components/ui/field";
import type { LeadNegotiation } from "@/db/schema";
import { PAYMENT_METHOD_LABELS } from "@/lib/catalog/labels";
import { formatCurrency, formatNumber, formatPhone } from "@/lib/utils";

type Props = {
  store: {
    name: string;
    legalName: string | null;
    cnpj: string | null;
    logoUrl: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
  };
  customer: { name: string; phone: string; email: string | null };
  vehicle: { description: string; years: string; mileageKm: number | null; priceCents: number | null };
  negotiation: LeadNegotiation;
  sellerName: string;
};

/**
 * Proposta para o cliente levar ou receber em PDF.
 *
 * Sai do "Salvar como PDF" do navegador, como o contrato de venda: nada de
 * gerar PDF no servidor (o Workers não tem como), e o papel na tela é o mesmo
 * que imprime. A observação interna da negociação fica de fora de propósito —
 * "achou caro, ofereci revisão" não é para o cliente ler.
 */
export function ProposalDocument({ store, customer, vehicle, negotiation, sellerName }: Props) {
  const [validDays, setValidDays] = useState(7);
  const today = new Date();
  const validUntil = new Date(today.getTime() + validDays * 86_400_000);
  const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" });

  const priceCents = negotiation.valueCents || vehicle.priceCents || 0;
  const tradeCents = negotiation.tradeIn?.valueCents ?? 0;
  const downCents = negotiation.downPaymentCents ?? 0;
  const balanceCents = Math.max(0, priceCents - tradeCents - downCents);
  const trade = negotiation.tradeIn;

  function print() {
    // o título vira o nome sugerido do arquivo ao salvar como PDF
    const previous = document.title;
    document.title = `Proposta - ${customer.name} - ${vehicle.description || "veículo"}`;
    window.addEventListener("afterprint", () => (document.title = previous), { once: true });
    window.print();
  }

  return (
    <div className="flex flex-col gap-4">
      <style>{`
        @page { size: A4; margin: 14mm 16mm; }
        @media print {
          body * { visibility: hidden !important; }
          #proposal-doc, #proposal-doc * { visibility: visible !important; }
          #proposal-doc { position: absolute; inset: 0 auto auto 0; width: 100%; box-shadow: none !important; border: 0 !important; padding: 0 !important; }
        }
      `}</style>

      <div className="flex flex-wrap items-end gap-3">
        <FormField label="Validade (dias)" htmlFor="proposal-days" className="mb-0">
          <Input
            id="proposal-days"
            inputMode="numeric"
            className="w-24"
            value={String(validDays)}
            onChange={(event) =>
              setValidDays(Math.min(90, Number(event.target.value.replace(/\D/g, "")) || 0))
            }
          />
        </FormField>
        <Button type="button" onClick={print}>
          <Printer className="h-3.5 w-3.5" />
          Imprimir ou salvar PDF
        </Button>
        {!priceCents ? (
          <p className="text-xs text-warning">
            Sem valor na ficha nem carro do estoque vinculado: a proposta sai sem preço.
          </p>
        ) : null}
      </div>

      <div className="min-w-0 overflow-x-auto">
        <article
          id="proposal-doc"
          className="mx-auto w-full max-w-[210mm] rounded-lg border border-border bg-white p-[14mm] text-[10pt] leading-relaxed text-neutral-900 shadow-sm"
        >
          <header className="flex items-center gap-4 border-b-2 border-neutral-900 pb-4">
            {store.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={store.logoUrl} alt={store.name} className="h-14 w-auto max-w-[160px] object-contain" />
            ) : null}
            <div className="min-w-0 flex-1">
              <h1 className="text-[14pt] font-bold uppercase tracking-wide">Proposta comercial</h1>
              <p className="text-neutral-600">
                {store.legalName || store.name}
                {store.cnpj ? ` · CNPJ ${store.cnpj}` : ""}
              </p>
            </div>
            <p className="text-right text-neutral-600">{dateFormat.format(today)}</p>
          </header>

          <Block title="Cliente">
            <Line label="Nome" value={customer.name} />
            <Line label="Telefone" value={customer.phone ? formatPhone(customer.phone) : null} />
            <Line label="E-mail" value={customer.email} />
          </Block>

          <Block title="Veículo">
            <Line label="Descrição" value={vehicle.description || null} />
            <Line label="Ano / modelo" value={vehicle.years || null} />
            <Line
              label="Quilometragem"
              value={vehicle.mileageKm !== null ? `${formatNumber(vehicle.mileageKm)} km` : null}
            />
          </Block>

          {trade && (trade.brand || trade.model) ? (
            <Block title="Veículo na troca">
              <Line label="Descrição" value={[trade.brand, trade.model].filter(Boolean).join(" ")} />
              <Line label="Ano" value={trade.year ? String(trade.year) : null} />
              <Line
                label="Quilometragem"
                value={trade.mileageKm ? `${formatNumber(trade.mileageKm)} km` : null}
              />
              <Line label="Valor avaliado" value={tradeCents ? formatCurrency(tradeCents) : null} />
            </Block>
          ) : null}

          <Block title="Condições">
            <Line label="Valor do veículo" value={priceCents ? formatCurrency(priceCents) : null} strong />
            <Line
              label="Forma de pagamento"
              value={negotiation.paymentMethod ? PAYMENT_METHOD_LABELS[negotiation.paymentMethod] : null}
            />
            <Line label="Troca" value={tradeCents ? `− ${formatCurrency(tradeCents)}` : null} />
            <Line label="Entrada" value={downCents ? `− ${formatCurrency(downCents)}` : null} />
            {tradeCents || downCents ? (
              <Line label="Saldo" value={formatCurrency(balanceCents)} strong />
            ) : null}
          </Block>

          <p className="mt-6 text-neutral-600">
            Proposta válida até {dateFormat.format(validUntil)}, sujeita à disponibilidade do veículo
            e, quando houver financiamento, à aprovação de crédito. A avaliação da troca depende de
            vistoria.
          </p>

          <footer className="mt-10 flex flex-wrap justify-between gap-6 border-t border-neutral-300 pt-4 text-neutral-600">
            <div>
              <p className="font-medium text-neutral-900">{sellerName}</p>
              <p>{store.name}</p>
            </div>
            <div className="text-right">
              {store.phone ? <p>{formatPhone(store.phone)}</p> : null}
              {store.email ? <p>{store.email}</p> : null}
              {store.address ? <p>{store.address}</p> : null}
            </div>
          </footer>
        </article>
      </div>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5 break-inside-avoid">
      <h2 className="mb-2 border-b border-neutral-300 pb-1 text-[10pt] font-bold uppercase tracking-wide">
        {title}
      </h2>
      <dl className="grid grid-cols-1 gap-y-1 sm:grid-cols-[160px_minmax(0,1fr)]">{children}</dl>
    </section>
  );
}

/** Campo vazio não aparece: proposta com "—" em metade das linhas parece rascunho. */
function Line({ label, value, strong }: { label: string; value: string | null; strong?: boolean }) {
  if (!value) return null;
  return (
    <>
      <dt className="text-neutral-500">{label}</dt>
      <dd className={strong ? "font-bold" : undefined}>{value}</dd>
    </>
  );
}
