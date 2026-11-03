"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileDown } from "lucide-react";
import {
  centsToMoney,
  digitsOf,
  maskCep,
  maskCnpj,
  maskCpf,
  maskMoney,
  maskPhone,
  moneyToCents,
} from "@carbud/site-kit/masks";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox, FormField, Input, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { apiPatch, apiPut } from "@/lib/client/api";
import { lookupCep } from "@/lib/client/cep";
import { moneyInWords } from "@/lib/format/money-words";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";

type Seller = {
  name: string;
  legalName: string | null;
  cnpj: string | null;
  logoUrl: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  email: string | null;
};

type VehicleInfo = {
  id: string;
  brand: string;
  model: string;
  years: string;
  plate: string;
  color: string;
  fuel: string;
  transmission: string;
  mileageKm: number;
  priceCents: number;
};

const PAYMENTS = [
  { key: "cash", label: "Valor pago à vista", placeholder: "Ex.: R$ 10.000,00 via PIX" },
  {
    key: "tradeIn",
    label: "Entrada em veículo",
    placeholder: "Ex.: GM Montana 2012/2013, branca, placa ODN4G12, RENAVAM 487246209, avaliado em R$ 28.000,00",
  },
  { key: "financed", label: "Saldo financiado", placeholder: "Ex.: R$ 26.900,00 pelo Banco Itaú em 48x de R$ 948,34" },
  { key: "card", label: "Valor pago através de cartão de crédito", placeholder: "Ex.: R$ 5.000,00 em 10x" },
  { key: "promissory", label: "Valor pago através de nota promissória", placeholder: "Ex.: 3 notas de R$ 1.000,00, vencendo todo dia 10" },
  { key: "notes", label: "Observações", placeholder: "Ex.: a transferência do veículo será paga pela loja" },
] as const;
type PaymentKey = (typeof PAYMENTS)[number]["key"];

const INSURANCES = [
  "Seguro proteção financeira",
  "Seguro auto assist",
  "Seguro auto RCF",
  "Seguro mão na roda",
  "Seguro acidentes pessoais premiado",
  "Seguro auto casco",
  "Seguro total",
  "Outros",
];

/**
 * As cláusulas são ligadas e desligadas no clique, não editadas como texto:
 * foi o que a loja achou mais prático no contrato que já usava (Dri-Car). O
 * texto livre fica para o campo de cláusulas adicionais.
 */
const CLAUSES = [
  {
    key: "object",
    title: "Objeto",
    on: true,
    text: () => [
      "O VENDEDOR vende e transfere ao COMPRADOR a propriedade do bem objeto do presente instrumento, pelo preço certo e ajustado entre as partes, acima indicado.",
      "Parágrafo primeiro. O COMPRADOR declara neste ato que examinou criteriosamente o veículo acima indicado em todos os seus itens e componentes, verificando o motor, a lataria e o estado geral do mesmo, razão pela qual o adquire no estado em que se apresenta.",
    ],
  },
  {
    key: "liability",
    title: "Responsabilidade a partir da assinatura",
    on: true,
    text: () => [
      "O VENDEDOR estará isento de responder administrativa, civil ou penalmente por qualquer evento ocorrido a partir da data da assinatura do presente contrato, sendo que responde por todos aqueles anteriores.",
    ],
  },
  {
    key: "free",
    title: "Entrega livre de ônus",
    on: true,
    text: () => [
      "O VENDEDOR se obriga a entregar o referido bem livre de qualquer ônus, principalmente os que se referem aos débitos de multas, IPVA, licenciamento e seguro obrigatório, devidos até a data da venda, inclusive no que diz respeito às multas que ainda não tenham sido cadastradas ou notificadas.",
    ],
  },
  {
    key: "expenses",
    title: "Despesas de transferência e financiamento por conta do comprador",
    on: true,
    text: () => [
      "As despesas com a transferência da propriedade e com o financiamento são de responsabilidade exclusiva do COMPRADOR.",
    ],
  },
  {
    key: "storeTransfer",
    title: "Transferência paga pela loja",
    on: false,
    text: () => [
      "As despesas com a transferência da propriedade do veículo serão pagas pelo VENDEDOR; as do financiamento, se houver, são de responsabilidade do COMPRADOR.",
    ],
  },
  {
    key: "transferDeadline",
    title: "Prazo de 30 dias para transferir",
    on: true,
    text: () => [
      "O COMPRADOR se obriga a transferir o veículo para o seu nome no prazo de 30 (trinta) dias, conforme o art. 123, § 1º, do Código de Trânsito Brasileiro, cabendo ao VENDEDOR a comunicação de venda prevista no art. 134 do mesmo Código.",
    ],
  },
  {
    key: "info",
    title: "Informações prestadas ao comprador",
    on: true,
    text: () => [
      "O COMPRADOR foi previamente informado pelo VENDEDOR no que diz respeito ao valor dos tributos incidentes sobre a comercialização do veículo e à regularidade do veículo quanto a furto, multas e taxas anuais legalmente devidas, débitos de impostos, alienação fiduciária e quaisquer outros registros que limitem ou impeçam a circulação do veículo.",
    ],
  },
  {
    key: "warranty",
    title: "Garantia legal (Código de Defesa do Consumidor)",
    on: true,
    text: () => [
      "A garantia do veículo será feita conforme o Código de Defesa do Consumidor, pelo prazo legal de 90 (noventa) dias para vícios, contados da entrega (art. 26, II).",
    ],
  },
  {
    key: "storeMechanics",
    title: "Garantia só com os mecânicos da loja",
    on: false,
    text: () => [
      "A garantia só terá efeito quando o veículo for analisado por mecânicos desta empresa, perdendo-se a garantia em caso de qualquer serviço realizado por terceiros.",
    ],
  },
  {
    key: "noSpareKey",
    title: "Veículo sem chave reserva",
    on: false,
    text: () => ["O veículo não possui chave reserva."],
  },
  {
    key: "forum",
    title: "Foro",
    on: true,
    text: (city: string) => [
      `Fica eleito o foro da Comarca de ${city || "________________"} para dirimir quaisquer dúvidas ou litígios decorrentes deste contrato, com renúncia expressa de qualquer outro, por mais privilegiado que seja.`,
    ],
  },
] as const;
type ClauseKey = (typeof CLAUSES)[number]["key"];

const MARITAL = ["Solteiro(a)", "Casado(a)", "União estável", "Divorciado(a)", "Viúvo(a)"];

function todayIso() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

const maskDocument = (value: string) => (digitsOf(value).length > 11 ? maskCnpj(value) : maskCpf(value));

function initialForm(vehicle: VehicleInfo, buyer: InitialBuyer, saleDate: string | null) {
  return {
    buyer: {
      name: buyer.name,
      document: buyer.cpf ? maskDocument(buyer.cpf) : "",
      rg: "",
      marital: MARITAL[0],
      phone: buyer.phone ? maskPhone(buyer.phone) : "",
      phone2: "",
      email: buyer.email,
      zip: "",
      street: "",
      number: "",
      district: "",
      city: "",
    },
    vehicle: {
      plate: vehicle.plate,
      renavam: "",
      chassis: "",
      mileage: vehicle.mileageKm ? formatNumber(vehicle.mileageKm) : "",
      kind: "Automóvel",
    },
    price: centsToMoney(vehicle.priceCents),
    saleDate: saleDate ?? todayIso(),
    payments: {} as Partial<Record<PaymentKey, string>>,
    insurances: [] as string[],
    insuranceValue: "",
    clauses: Object.fromEntries(CLAUSES.map((clause) => [clause.key, clause.on])) as Record<ClauseKey, boolean>,
    extraClauses: "",
    witnesses: true,
  };
}
type Form = ReturnType<typeof initialForm>;
type InitialBuyer = { name: string; phone: string; email: string; cpf?: string };

/**
 * Junta o contrato salvo ao formulário novo. Campo que surgiu depois do
 * salvamento fica com o padrão; e o que o financeiro também guarda (comprador,
 * valor, data) vem de lá, porque pode ter sido corrigido na ficha do carro.
 */
function restoreForm(base: Form, saved: Record<string, unknown> | null, hasSale: boolean): Form {
  if (!saved) return base;
  const parsed = saved as Partial<Form>;
  const merged: Form = {
    ...base,
    ...parsed,
    buyer: { ...base.buyer, ...parsed.buyer },
    vehicle: { ...base.vehicle, ...parsed.vehicle },
    clauses: { ...base.clauses, ...parsed.clauses },
  };
  if (!hasSale) return merged;
  return {
    ...merged,
    price: base.price,
    saleDate: base.saleDate,
    buyer: {
      ...merged.buyer,
      name: base.buyer.name || merged.buyer.name,
      document: base.buyer.document || merged.buyer.document,
      phone: base.buyer.phone || merged.buyer.phone,
    },
  };
}

/**
 * Venda do carro: preenche o contrato, grava a venda e gera o PDF.
 *
 * "Confirmar venda" grava o que o resto do painel usa — preço, data e
 * comprador no financeiro, e o carro como vendido (sai do site e dos portais)
 * — e abre a impressão. O formulário inteiro (RG, endereço, pagamento,
 * cláusulas) vai junto, para reimprimir de qualquer computador.
 *
 * PDF pela impressão do navegador, não gerado no servidor: o painel roda em
 * Cloudflare Workers, sem navegador headless, e bibliotecas de PDF desenham
 * por coordenada. O HTML com `@page` sai em A4 com a fonte e o logo certos.
 */
export function SaleDocument({
  seller,
  vehicle,
  buyer: initialBuyer,
  saleDate,
  savedContract,
  sold,
  canWriteVehicle,
  canWriteFinance,
}: {
  seller: Seller;
  vehicle: VehicleInfo;
  buyer: InitialBuyer;
  saleDate: string | null;
  savedContract: Record<string, unknown> | null;
  sold: boolean;
  canWriteVehicle: boolean;
  canWriteFinance: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState<Form>(() =>
    restoreForm(initialForm(vehicle, initialBuyer, saleDate), savedContract, saleDate !== null),
  );
  const [saving, setSaving] = useState(false);

  const setBuyer = (key: keyof Form["buyer"], value: string) =>
    setForm((current) => ({ ...current, buyer: { ...current.buyer, [key]: value } }));
  const setVehicle = (key: keyof Form["vehicle"], value: string) =>
    setForm((current) => ({ ...current, vehicle: { ...current.vehicle, [key]: value } }));
  const togglePayment = (key: PaymentKey, on: boolean) =>
    setForm((current) => {
      const payments = { ...current.payments };
      if (on) payments[key] = payments[key] ?? "";
      else delete payments[key];
      return { ...current, payments };
    });
  const toggleInsurance = (name: string, on: boolean) =>
    setForm((current) => ({
      ...current,
      insurances: on ? [...current.insurances, name] : current.insurances.filter((item) => item !== name),
    }));

  // quem paga a transferência: uma cláusula ou a outra, nunca as duas
  const EXCLUSIVE: Partial<Record<ClauseKey, ClauseKey>> = { expenses: "storeTransfer", storeTransfer: "expenses" };
  const toggleClause = (key: ClauseKey, on: boolean) =>
    setForm((current) => {
      const clauses = { ...current.clauses, [key]: on };
      const other = EXCLUSIVE[key];
      if (on && other) clauses[other] = false;
      return { ...current, clauses };
    });

  async function fillAddress(zip: string) {
    const found = await lookupCep(zip);
    if (!found) return;
    setForm((current) => ({
      ...current,
      buyer: {
        ...current.buyer,
        street: found.street || current.buyer.street,
        district: found.district || current.buyer.district,
        city: [found.city, found.state].filter(Boolean).join("/") || current.buyer.city,
      },
    }));
  }

  const priceCents = moneyToCents(form.price);
  const financed = "financed" in form.payments;
  const canSave = canWriteFinance || (canWriteVehicle && !sold);

  function print() {
    // o título vira o nome sugerido do arquivo ao salvar como PDF
    const previous = document.title;
    document.title = `Contrato - ${vehicle.brand} ${vehicle.model} - ${form.buyer.name || "comprador"}`;
    window.addEventListener("afterprint", () => (document.title = previous), { once: true });
    window.print();
  }

  async function confirmSale() {
    if (!form.buyer.name.trim()) return toast.error("Informe o nome do comprador.");
    if (priceCents <= 0) return toast.error("Informe o valor da venda.");
    if (!form.saleDate) return toast.error("Informe a data da venda.");

    setSaving(true);
    if (canWriteFinance) {
      const result = await apiPut(`/api/admin/vehicles/${vehicle.id}/finance`, {
        salePriceCents: priceCents,
        saleDate: form.saleDate,
        buyerName: form.buyer.name.trim(),
        buyerDocument: form.buyer.document,
        buyerPhone: form.buyer.phone,
        contract: form,
      });
      if (!result.ok) {
        setSaving(false);
        return toast.error(result.error);
      }
    }
    if (canWriteVehicle && !sold) {
      const result = await apiPatch(`/api/admin/vehicles/${vehicle.id}`, { status: "sold" });
      if (!result.ok) {
        setSaving(false);
        return toast.error(result.error);
      }
    }
    setSaving(false);
    toast.success(sold ? "Venda atualizada." : "Venda registrada. O carro saiu do site e dos portais.");
    router.refresh();
    print();
  }

  const place = [seller.city, seller.state].filter(Boolean).join("/");
  const saleDay = form.saleDate ? new Date(`${form.saleDate}T12:00:00`) : new Date();
  const enabledClauses: { title: string; paragraphs: readonly string[] }[] = CLAUSES.filter(
    (clause) => form.clauses[clause.key],
  ).map((clause) => ({
    title: clause.title,
    paragraphs: clause.text(place) as readonly string[],
  }));
  if (financed && form.insurances.length > 0) {
    const value = moneyToCents(form.insuranceValue);
    // antes do foro, que fecha as cláusulas
    const forum = enabledClauses.findIndex((clause) => clause.title === "Foro");
    enabledClauses.splice(forum === -1 ? enabledClauses.length : forum, 0, {
      title: "Seguros vinculados ao financiamento",
      paragraphs: [
        `O contrato de financiamento deste veículo possui os seguintes seguros inclusos: ${form.insurances
          .map((item) => item.toUpperCase())
          .join(", ")}${value > 0 ? `, no valor total de ${formatCurrency(value)} (${moneyInWords(value)})` : ""}.`,
        "Parágrafo único. Em caso de quitação do financiamento por parte do COMPRADOR, o mesmo se responsabiliza em quitar todas as despesas referentes ao processo de retirada do gravame.",
      ],
    });
  }
  const extra = form.extraClauses
    .split(/\n\s*\n/)
    .map((text) => text.trim())
    .filter(Boolean);
  const buyerAddress = [
    [form.buyer.street, form.buyer.number].filter(Boolean).join(", "),
    form.buyer.district,
  ]
    .filter(Boolean)
    .join(" – ");

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
      {/*
       * Só o papel vai para a impressão. Esconder o resto por visibilidade (e
       * não por display) dispensa mexer no shell do painel.
       */}
      <style>{`
        @page { size: A4; margin: 14mm 16mm; }
        @media print {
          body * { visibility: hidden !important; }
          #sale-doc, #sale-doc * { visibility: visible !important; }
          #sale-doc { position: absolute; inset: 0 auto auto 0; width: 100%; box-shadow: none !important; border: 0 !important; padding: 0 !important; }
        }
      `}</style>

      <div className="flex min-w-0 flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Comprador</CardTitle>
          </CardHeader>
          <CardContent>
            <FormField label="Nome completo *" htmlFor="b-name">
              <Input id="b-name" value={form.buyer.name} onChange={(e) => setBuyer("name", e.target.value)} />
            </FormField>
            <div className="grid grid-cols-2 gap-x-3">
              <FormField label="CPF / CNPJ" htmlFor="b-doc">
                <Input
                  id="b-doc"
                  inputMode="numeric"
                  value={form.buyer.document}
                  onChange={(e) => setBuyer("document", maskDocument(e.target.value))}
                />
              </FormField>
              <FormField label="RG / Inscrição" htmlFor="b-rg">
                <Input id="b-rg" value={form.buyer.rg} onChange={(e) => setBuyer("rg", e.target.value)} />
              </FormField>
              <FormField label="Estado civil" htmlFor="b-marital">
                <Select id="b-marital" value={form.buyer.marital} onChange={(e) => setBuyer("marital", e.target.value)}>
                  {MARITAL.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </Select>
              </FormField>
              <FormField label="E-mail" htmlFor="b-email">
                <Input id="b-email" type="email" value={form.buyer.email} onChange={(e) => setBuyer("email", e.target.value)} />
              </FormField>
              <FormField label="Telefone" htmlFor="b-phone">
                <Input
                  id="b-phone"
                  inputMode="tel"
                  value={form.buyer.phone}
                  onChange={(e) => setBuyer("phone", maskPhone(e.target.value))}
                />
              </FormField>
              <FormField label="Telefone 2" htmlFor="b-phone2">
                <Input
                  id="b-phone2"
                  inputMode="tel"
                  value={form.buyer.phone2}
                  onChange={(e) => setBuyer("phone2", maskPhone(e.target.value))}
                />
              </FormField>
              <FormField label="CEP" htmlFor="b-zip">
                <Input
                  id="b-zip"
                  inputMode="numeric"
                  placeholder="Preenche o endereço"
                  value={form.buyer.zip}
                  onChange={(e) => {
                    const zip = maskCep(e.target.value);
                    setBuyer("zip", zip);
                    if (digitsOf(zip).length === 8) void fillAddress(zip);
                  }}
                />
              </FormField>
              <FormField label="Cidade/UF" htmlFor="b-city">
                <Input id="b-city" value={form.buyer.city} onChange={(e) => setBuyer("city", e.target.value)} />
              </FormField>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-x-3">
              <FormField label="Rua" htmlFor="b-street">
                <Input id="b-street" value={form.buyer.street} onChange={(e) => setBuyer("street", e.target.value)} />
              </FormField>
              <FormField label="Nº / Compl." htmlFor="b-number">
                <Input id="b-number" value={form.buyer.number} onChange={(e) => setBuyer("number", e.target.value)} />
              </FormField>
            </div>
            <FormField label="Bairro" htmlFor="b-district" className="mb-0">
              <Input id="b-district" value={form.buyer.district} onChange={(e) => setBuyer("district", e.target.value)} />
            </FormField>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Veículo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-x-3">
              <FormField label="Placa" htmlFor="v-plate">
                <Input id="v-plate" value={form.vehicle.plate} onChange={(e) => setVehicle("plate", e.target.value.toUpperCase())} />
              </FormField>
              <FormField label="Km na entrega" htmlFor="v-km">
                <Input id="v-km" inputMode="numeric" value={form.vehicle.mileage} onChange={(e) => setVehicle("mileage", e.target.value)} />
              </FormField>
              <FormField label="RENAVAM" htmlFor="v-renavam">
                <Input id="v-renavam" inputMode="numeric" value={form.vehicle.renavam} onChange={(e) => setVehicle("renavam", e.target.value)} />
              </FormField>
              <FormField label="Chassi" htmlFor="v-chassis">
                <Input id="v-chassis" value={form.vehicle.chassis} onChange={(e) => setVehicle("chassis", e.target.value.toUpperCase())} />
              </FormField>
            </div>
            <FormField label="Tipo" htmlFor="v-kind" className="mb-0">
              <Input id="v-kind" value={form.vehicle.kind} onChange={(e) => setVehicle("kind", e.target.value)} />
            </FormField>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Valor e pagamento</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-x-3">
              <FormField label="Valor total (R$) *" htmlFor="d-price">
                <Input
                  id="d-price"
                  inputMode="numeric"
                  value={form.price}
                  onChange={(e) => setForm((c) => ({ ...c, price: maskMoney(e.target.value) }))}
                />
              </FormField>
              <FormField label="Data da venda *" htmlFor="d-date">
                <Input
                  id="d-date"
                  type="date"
                  value={form.saleDate}
                  onChange={(e) => setForm((c) => ({ ...c, saleDate: e.target.value }))}
                />
              </FormField>
            </div>
            {priceCents > 0 ? <p className="-mt-2 mb-4 text-xs text-muted">({moneyInWords(priceCents)})</p> : null}

            <p className="label-instrument mb-2 text-text">Condições de pagamento</p>
            <div className="mb-4 flex flex-col gap-2">
              {PAYMENTS.map((payment) => {
                const on = payment.key in form.payments;
                return (
                  <div key={payment.key} className={cn("rounded-lg border border-border", on && "border-accent bg-accent/5")}>
                    <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2.5 text-sm">
                      <Checkbox checked={on} onChange={(e) => togglePayment(payment.key, e.target.checked)} />
                      {payment.label}
                    </label>
                    {on ? (
                      <div className="px-3 pb-3">
                        <Input
                          aria-label={`Detalhes: ${payment.label}`}
                          placeholder={payment.placeholder}
                          value={form.payments[payment.key] ?? ""}
                          onChange={(e) =>
                            setForm((c) => ({ ...c, payments: { ...c.payments, [payment.key]: e.target.value } }))
                          }
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {financed ? (
              <>
                <p className="label-instrument mb-2 text-text">Seguros vinculados ao financiamento</p>
                <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {INSURANCES.map((name) => (
                    <label
                      key={name}
                      className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border px-3 py-2 text-sm"
                    >
                      <Checkbox
                        checked={form.insurances.includes(name)}
                        onChange={(e) => toggleInsurance(name, e.target.checked)}
                      />
                      {name}
                    </label>
                  ))}
                </div>
                <FormField label="Valor dos seguros (R$)" htmlFor="d-insurance" className="mb-0">
                  <Input
                    id="d-insurance"
                    inputMode="numeric"
                    value={form.insuranceValue}
                    onChange={(e) => setForm((c) => ({ ...c, insuranceValue: maskMoney(e.target.value) }))}
                  />
                </FormField>
              </>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cláusulas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-xs text-muted">Marque as que entram no contrato. Revise com seu jurídico.</p>
            <div className="mb-4 flex flex-col gap-1.5">
              {CLAUSES.map((clause) => (
                <label key={clause.key} className="flex cursor-pointer items-start gap-2.5 py-1 text-sm">
                  <Checkbox
                    className="mt-0.5"
                    checked={form.clauses[clause.key]}
                    onChange={(e) => toggleClause(clause.key, e.target.checked)}
                  />
                  {clause.title}
                </label>
              ))}
              <label className="flex cursor-pointer items-start gap-2.5 py-1 text-sm">
                <Checkbox
                  className="mt-0.5"
                  checked={form.witnesses}
                  onChange={(e) => setForm((c) => ({ ...c, witnesses: e.target.checked }))}
                />
                Assinatura de duas testemunhas
              </label>
            </div>
            <FormField
              label="Cláusulas adicionais"
              htmlFor="d-extra"
              hint="Uma por parágrafo, separadas por linha em branco."
              className="mb-0"
            >
              <Textarea
                id="d-extra"
                className="min-h-20"
                value={form.extraClauses}
                onChange={(e) => setForm((c) => ({ ...c, extraClauses: e.target.value }))}
              />
            </FormField>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-2">
          {canSave ? (
            <Button onClick={confirmSale} loading={saving}>
              <CheckCircle2 className="h-4 w-4" />
              {sold ? "Atualizar venda e gerar PDF" : "Confirmar venda e gerar PDF"}
            </Button>
          ) : null}
          <Button variant={canSave ? "secondary" : "primary"} onClick={print}>
            <FileDown className="h-4 w-4" />
            Só gerar PDF
          </Button>
          <p className="text-xs text-muted">
            {sold || !canSave
              ? "Na janela de impressão, escolha \"Salvar como PDF\" como destino."
              : "Confirmar marca o carro como vendido (sai do site e dos portais) e lança a venda no financeiro. Na impressão, escolha \"Salvar como PDF\"."}
          </p>
        </div>
      </div>

      {/* o papel: largura de A4 na tela, para a prévia bater com o impresso */}
      {/* a prévia acompanha a rolagem do formulário; na impressão volta ao fluxo normal */}
      <div className="min-w-0 overflow-x-auto xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:self-start xl:overflow-y-auto print:static print:max-h-none print:overflow-visible">
        <article
          id="sale-doc"
          className="mx-auto w-full max-w-[210mm] rounded-lg border border-border bg-white p-[14mm] text-[10pt] leading-relaxed text-neutral-900 shadow-sm"
        >
          <header className="flex items-center gap-4 border-b-2 border-neutral-900 pb-4">
            {seller.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={seller.logoUrl} alt={seller.name} className="h-14 w-auto max-w-[160px] object-contain" />
            ) : null}
            <h1 className="min-w-0 flex-1 text-center text-[14pt] font-bold uppercase leading-tight tracking-wide">
              Contrato particular de
              <br />
              compra e venda de veículo
            </h1>
          </header>

          <Section title="1. Dados do vendedor">
            <Row label="Razão social" value={seller.legalName || seller.name} wide />
            <Row label="CNPJ" value={seller.cnpj && maskCnpj(seller.cnpj)} />
            <Row label="Telefone" value={seller.phone} />
            <Row label="Endereço" value={seller.address} wide />
          </Section>

          <Section title="2. Dados do comprador">
            <Row label="Nome completo" value={form.buyer.name.toUpperCase()} wide />
            <Row label={digitsOf(form.buyer.document).length > 11 ? "CNPJ" : "CPF"} value={form.buyer.document} />
            <Row label="RG / Inscrição" value={form.buyer.rg} />
            <Row label="Estado civil" value={form.buyer.marital} />
            <Row label="Telefone" value={[form.buyer.phone, form.buyer.phone2].filter(Boolean).join(" / ")} />
            <Row label="Endereço" value={buyerAddress} wide />
            <Row label="Cidade / UF" value={form.buyer.city} />
            <Row label="CEP" value={form.buyer.zip} />
            {form.buyer.email ? <Row label="E-mail" value={form.buyer.email} wide /> : null}
          </Section>

          <Section title="3. Identificação do veículo">
            <Row label="Marca" value={vehicle.brand.toUpperCase()} />
            <Row label="Modelo" value={vehicle.model.toUpperCase()} />
            <Row label="Ano / modelo" value={vehicle.years} />
            <Row label="Combustível" value={vehicle.fuel.toUpperCase()} />
            <Row label="Cor" value={vehicle.color.toUpperCase()} />
            <Row label="Quilometragem" value={form.vehicle.mileage && `${form.vehicle.mileage} km`} />
            <Row label="Placa" value={form.vehicle.plate} />
            <Row label="RENAVAM" value={form.vehicle.renavam} />
            <Row label="Chassi" value={form.vehicle.chassis} />
            <Row label="Tipo" value={form.vehicle.kind.toUpperCase()} />
          </Section>

          <section className="mt-5 break-inside-avoid">
            <SectionTitle>4. Valor e condições de pagamento</SectionTitle>
            <p>
              <span className="text-neutral-500">Valor total da venda:</span>{" "}
              <strong>{formatCurrency(priceCents)}</strong>
              {priceCents > 0 ? ` (${moneyInWords(priceCents)})` : null}
            </p>
            {PAYMENTS.filter((payment) => payment.key in form.payments).map((payment) => (
              <p key={payment.key} className="mt-1 text-justify">
                <span className="text-neutral-500">{payment.label}:</span>{" "}
                {form.payments[payment.key] || <span className="inline-block w-64 border-b border-neutral-400">&nbsp;</span>}
              </p>
            ))}
          </section>

          <section className="mt-5">
            <SectionTitle>5. Cláusulas contratuais</SectionTitle>
            <p className="text-justify">
              Pelo presente instrumento particular de contrato de compra e venda de veículo, firmado pelas partes
              acima qualificadas, aqui denominadas simplesmente VENDEDOR e COMPRADOR, é justo e contratado o
              seguinte:
            </p>
            {enabledClauses.map((clause, index) => (
              <div key={clause.title} className="mt-2 text-justify">
                {clause.paragraphs.map((paragraph, i) => (
                  <p key={i} className={i > 0 ? "mt-1" : undefined}>
                    {i === 0 ? (
                      <strong>
                        Cláusula {index + 1}ª – {clause.title}.{" "}
                      </strong>
                    ) : null}
                    {paragraph}
                  </p>
                ))}
              </div>
            ))}
            {extra.map((text, index) => (
              <p key={index} className="mt-2 text-justify">
                <strong>Cláusula {enabledClauses.length + index + 1}ª.</strong> {text}
              </p>
            ))}
          </section>

          <p className="mt-5 break-inside-avoid text-justify">
            E por estarem assim acordados, firmam o presente instrumento em 02 (duas) vias de igual teor e forma,
            obrigando-se as partes por si, seus herdeiros e sucessores.
          </p>
          <p className="mt-3 text-right">
            {place || "________________"},{" "}
            {saleDay.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}.
          </p>

          <div className="mt-14 grid grid-cols-2 gap-x-10 gap-y-14 break-inside-avoid text-center text-[9pt]">
            <Signature label="Vendedor" name={(seller.legalName || seller.name).toUpperCase()} />
            <Signature label="Comprador" name={form.buyer.name.toUpperCase()} />
            {form.witnesses ? (
              <>
                <Signature label="Testemunha 1" name="Nome e CPF" />
                <Signature label="Testemunha 2" name="Nome e CPF" />
              </>
            ) : null}
          </div>
        </article>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 border-b border-neutral-300 pb-1 text-[9pt] font-bold uppercase tracking-wider text-neutral-600">
      {children}
    </h2>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5 break-inside-avoid">
      <SectionTitle>{title}</SectionTitle>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1">{children}</dl>
    </section>
  );
}

function Row({ label, value, wide }: { label: string; value: string | null | undefined; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2 flex gap-2" : "flex gap-2"}>
      <dt className="shrink-0 text-neutral-500">{label}:</dt>
      {/* campo vazio vira linha para preencher à mão, não some */}
      <dd className="min-w-0 flex-1 whitespace-pre-line font-medium">
        {value || <span className="inline-block w-full border-b border-neutral-400">&nbsp;</span>}
      </dd>
    </div>
  );
}

function Signature({ label, name }: { label: string; name: string }) {
  return (
    <div>
      <div className="border-t border-neutral-900 pt-1.5 font-medium">{name || " "}</div>
      <div className="text-neutral-500">{label}</div>
    </div>
  );
}
