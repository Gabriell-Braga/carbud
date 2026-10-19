"use client";

import { useState } from "react";
import { FileDown } from "lucide-react";
import {
  centsToMoney,
  maskCep,
  maskCpf,
  maskMoney,
  maskPhone,
  moneyToCents,
} from "@carbud/site-kit/masks";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField, Input, Textarea } from "@/components/ui/field";
import { formatCurrency, formatNumber } from "@/lib/utils";

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
  title: string;
  years: string;
  plate: string;
  color: string;
  fuel: string;
  transmission: string;
  mileageKm: number;
  priceCents: number;
};

function defaultClauses(city: string) {
  return [
    "O VENDEDOR declara ser legítimo proprietário do veículo descrito, livre e desembaraçado de ônus, multas, tributos e débitos até a data e hora da entrega.",
    "O COMPRADOR declara ter examinado o veículo e recebê-lo no estado de conservação e funcionamento em que se encontra.",
    "O VENDEDOR oferece a garantia legal de 90 (noventa) dias para vícios do veículo, contados da entrega, nos termos do art. 26, II, do Código de Defesa do Consumidor.",
    "Multas, tributos e demais encargos referentes a fatos ocorridos a partir da data e hora da entrega são de responsabilidade do COMPRADOR.",
    "O COMPRADOR se obriga a transferir o veículo para o seu nome no prazo de 30 (trinta) dias, conforme o art. 123, § 1º, do Código de Trânsito Brasileiro, cabendo ao VENDEDOR a comunicação de venda prevista no art. 134 do mesmo Código.",
    `As partes elegem o foro da comarca de ${city || "________________"} para dirimir quaisquer questões oriundas deste contrato.`,
  ].join("\n\n");
}

function today() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

/**
 * Contrato de compra e venda, montado na tela e salvo em PDF pela impressão
 * do navegador.
 *
 * Por que impressão e não um gerador de PDF no servidor: o painel roda em
 * Cloudflare Workers, onde não há navegador headless, e as bibliotecas de PDF
 * desenham por coordenada — cada ajuste de layout vira conta de milímetro. O
 * HTML com `@page` sai em A4, com a fonte e o logo certos, e "Salvar como PDF"
 * existe em todo navegador.
 *
 * Nada é gravado: o documento é refeito a partir do carro sempre que preciso.
 */
export function SaleDocument({
  seller,
  vehicle,
  buyer: initialBuyer,
}: {
  seller: Seller;
  vehicle: VehicleInfo;
  buyer: { name: string; phone: string; email: string };
}) {
  const [buyer, setBuyer] = useState({
    name: initialBuyer.name,
    cpf: "",
    rg: "",
    phone: initialBuyer.phone ? maskPhone(initialBuyer.phone) : "",
    email: initialBuyer.email,
    address: "",
    city: "",
    zip: "",
  });
  const [deal, setDeal] = useState({
    plate: vehicle.plate,
    renavam: "",
    chassis: "",
    mileage: vehicle.mileageKm ? formatNumber(vehicle.mileageKm) : "",
    price: centsToMoney(vehicle.priceCents),
    payment: "À vista.",
    deliveredAt: today(),
    clauses: defaultClauses([seller.city, seller.state].filter(Boolean).join("/")),
  });

  const setB = (key: keyof typeof buyer) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setBuyer((current) => ({ ...current, [key]: event.target.value }));
  const setD =
    (key: keyof typeof deal) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setDeal((current) => ({ ...current, [key]: event.target.value }));

  function handlePrint() {
    // o título vira o nome sugerido do arquivo ao salvar como PDF
    const previous = document.title;
    document.title = `Contrato - ${vehicle.title} - ${buyer.name || "comprador"}`;
    window.addEventListener("afterprint", () => (document.title = previous), { once: true });
    window.print();
  }

  const delivered = deal.deliveredAt ? new Date(deal.deliveredAt) : null;
  const place = [seller.city, seller.state].filter(Boolean).join("/");
  const clauses = deal.clauses
    .split(/\n\s*\n/)
    .map((clause) => clause.trim())
    .filter(Boolean);

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
      {/*
       * Só o papel vai para a impressão. Esconder o resto por visibilidade (e
       * não por display) dispensa mexer no shell do painel: o layout continua
       * igual, e o documento é reposicionado no topo da página.
       */}
      <style>{`
        @page { size: A4; margin: 14mm 16mm; }
        @media print {
          body * { visibility: hidden !important; }
          #sale-doc, #sale-doc * { visibility: visible !important; }
          #sale-doc { position: absolute; inset: 0 auto auto 0; width: 100%; box-shadow: none !important; border: 0 !important; padding: 0 !important; }
        }
      `}</style>

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Comprador</CardTitle>
          </CardHeader>
          <CardContent>
            <FormField label="Nome completo" htmlFor="b-name">
              <Input id="b-name" value={buyer.name} onChange={setB("name")} />
            </FormField>
            <div className="grid grid-cols-2 gap-x-3">
              <FormField label="CPF" htmlFor="b-cpf">
                <Input
                  id="b-cpf"
                  inputMode="numeric"
                  value={buyer.cpf}
                  onChange={(event) => setBuyer((c) => ({ ...c, cpf: maskCpf(event.target.value) }))}
                />
              </FormField>
              <FormField label="RG" htmlFor="b-rg">
                <Input id="b-rg" value={buyer.rg} onChange={setB("rg")} />
              </FormField>
              <FormField label="Telefone" htmlFor="b-phone">
                <Input
                  id="b-phone"
                  inputMode="tel"
                  value={buyer.phone}
                  onChange={(event) =>
                    setBuyer((c) => ({ ...c, phone: maskPhone(event.target.value) }))
                  }
                />
              </FormField>
              <FormField label="E-mail" htmlFor="b-email">
                <Input id="b-email" type="email" value={buyer.email} onChange={setB("email")} />
              </FormField>
            </div>
            <FormField label="Endereço" htmlFor="b-address">
              <Input
                id="b-address"
                placeholder="Rua, número, bairro"
                value={buyer.address}
                onChange={setB("address")}
              />
            </FormField>
            <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-x-3">
              <FormField label="Cidade/UF" htmlFor="b-city">
                <Input id="b-city" value={buyer.city} onChange={setB("city")} />
              </FormField>
              <FormField label="CEP" htmlFor="b-zip">
                <Input
                  id="b-zip"
                  inputMode="numeric"
                  mask={maskCep}
                  value={buyer.zip}
                  onChange={setB("zip")}
                />
              </FormField>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Veículo e pagamento</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-x-3">
              <FormField label="Placa" htmlFor="d-plate">
                <Input id="d-plate" value={deal.plate} onChange={setD("plate")} />
              </FormField>
              <FormField label="Km na entrega" htmlFor="d-km">
                <Input id="d-km" value={deal.mileage} onChange={setD("mileage")} />
              </FormField>
              <FormField label="RENAVAM" htmlFor="d-renavam">
                <Input id="d-renavam" inputMode="numeric" value={deal.renavam} onChange={setD("renavam")} />
              </FormField>
              <FormField label="Chassi" htmlFor="d-chassis">
                <Input id="d-chassis" value={deal.chassis} onChange={setD("chassis")} />
              </FormField>
              <FormField label="Valor (R$)" htmlFor="d-price">
                <Input
                  id="d-price"
                  inputMode="numeric"
                  value={deal.price}
                  onChange={(event) => setDeal((c) => ({ ...c, price: maskMoney(event.target.value) }))}
                />
              </FormField>
              <FormField label="Entrega" htmlFor="d-delivered">
                <Input
                  id="d-delivered"
                  type="datetime-local"
                  value={deal.deliveredAt}
                  onChange={setD("deliveredAt")}
                />
              </FormField>
            </div>
            <FormField
              label="Forma de pagamento"
              htmlFor="d-payment"
              hint="Ex.: entrada de R$ 20.000,00 via PIX e saldo financiado pelo banco X em 48x."
            >
              <Textarea id="d-payment" className="min-h-16" value={deal.payment} onChange={setD("payment")} />
            </FormField>
            <FormField
              label="Cláusulas"
              htmlFor="d-clauses"
              hint="Uma por parágrafo, separadas por linha em branco. Revise com seu jurídico."
            >
              <Textarea id="d-clauses" className="min-h-48" value={deal.clauses} onChange={setD("clauses")} />
            </FormField>
          </CardContent>
        </Card>

        <Button onClick={handlePrint}>
          <FileDown className="h-4 w-4" />
          Gerar PDF
        </Button>
        <p className="-mt-2 text-xs text-muted">
          Na janela de impressão, escolha &quot;Salvar como PDF&quot; como destino.
        </p>
      </div>

      {/* o papel: largura de A4 na tela, para a prévia bater com o impresso */}
      <div className="min-w-0 overflow-x-auto">
        <article
          id="sale-doc"
          className="mx-auto w-full max-w-[210mm] rounded-lg border border-border bg-white p-[14mm] text-[10.5pt] leading-relaxed text-neutral-900 shadow-sm"
        >
          <header className="flex items-center justify-between gap-6 border-b-2 border-neutral-900 pb-4">
            <div className="flex min-w-0 items-center gap-4">
              {seller.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={seller.logoUrl} alt={seller.name} className="h-14 w-auto max-w-[160px] object-contain" />
              ) : null}
              <div className="min-w-0">
                <p className="text-[13pt] font-bold">{seller.legalName || seller.name}</p>
                {seller.cnpj ? <p className="text-[9pt] text-neutral-600">CNPJ {seller.cnpj}</p> : null}
                {seller.address ? <p className="text-[9pt] text-neutral-600">{seller.address}</p> : null}
                <p className="text-[9pt] text-neutral-600">
                  {[seller.phone, seller.email].filter(Boolean).join(" · ")}
                </p>
              </div>
            </div>
          </header>

          <h1 className="mt-6 text-center text-[14pt] font-bold uppercase tracking-wide">
            Contrato de compra e venda de veículo
          </h1>

          <Section title="Vendedor">
            <Row label="Razão social" value={seller.legalName || seller.name} />
            <Row label="CNPJ" value={seller.cnpj} />
            <Row label="Endereço" value={seller.address} wide />
          </Section>

          <Section title="Comprador">
            <Row label="Nome" value={buyer.name} wide />
            <Row label="CPF" value={buyer.cpf} />
            <Row label="RG" value={buyer.rg} />
            <Row label="Telefone" value={buyer.phone} />
            <Row label="E-mail" value={buyer.email} />
            <Row
              label="Endereço"
              value={[buyer.address, buyer.city, buyer.zip && `CEP ${buyer.zip}`].filter(Boolean).join(" · ")}
              wide
            />
          </Section>

          <Section title="Veículo">
            <Row label="Marca/modelo" value={vehicle.title} wide />
            <Row label="Ano fab./modelo" value={vehicle.years} />
            <Row label="Placa" value={deal.plate} />
            <Row label="RENAVAM" value={deal.renavam} />
            <Row label="Chassi" value={deal.chassis} />
            <Row label="Cor" value={vehicle.color} />
            <Row label="Combustível" value={vehicle.fuel} />
            <Row label="Câmbio" value={vehicle.transmission} />
            <Row label="Quilometragem" value={deal.mileage && `${deal.mileage} km`} />
          </Section>

          <Section title="Preço e pagamento">
            <Row label="Valor total" value={formatCurrency(moneyToCents(deal.price))} />
            <Row
              label="Entrega"
              value={
                delivered && !Number.isNaN(delivered.getTime())
                  ? delivered.toLocaleString("pt-BR", { dateStyle: "long", timeStyle: "short" })
                  : ""
              }
            />
            <Row label="Forma de pagamento" value={deal.payment} wide />
          </Section>

          <Section title="Cláusulas">
            <ol className="col-span-2 list-decimal space-y-1.5 pl-5 text-justify">
              {clauses.map((clause, index) => (
                <li key={index}>{clause}</li>
              ))}
            </ol>
          </Section>

          <p className="mt-6 break-inside-avoid">
            E, por estarem de acordo, as partes assinam o presente em duas vias de igual teor.
          </p>
          <p className="mt-3 text-right">
            {place || "________________"},{" "}
            {(delivered && !Number.isNaN(delivered.getTime()) ? delivered : new Date()).toLocaleDateString(
              "pt-BR",
              { day: "numeric", month: "long", year: "numeric" },
            )}
            .
          </p>

          <div className="mt-14 grid grid-cols-2 gap-x-10 gap-y-14 break-inside-avoid text-center text-[9pt]">
            <Signature label="Vendedor" name={seller.legalName || seller.name} />
            <Signature label="Comprador" name={buyer.name} />
            <Signature label="Testemunha 1" name="Nome e CPF" />
            <Signature label="Testemunha 2" name="Nome e CPF" />
          </div>
        </article>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5 break-inside-avoid">
      <h2 className="mb-2 border-b border-neutral-300 pb-1 text-[9pt] font-bold uppercase tracking-wider text-neutral-600">
        {title}
      </h2>
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
      <div className="border-t border-neutral-900 pt-1.5 font-medium">{name || " "}</div>
      <div className="text-neutral-500">{label}</div>
    </div>
  );
}
