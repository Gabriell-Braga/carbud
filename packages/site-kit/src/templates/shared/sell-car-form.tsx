"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { apiPost } from "../../lib/client-api";
import { readUtm } from "./utm";
import {
  newBrowserEventId,
  readTrackingContext,
  trackBrowserEvent,
} from "./tracking";
import { maskInteger, maskPhone } from "../../lib/masks";

const CURRENT_YEAR = new Date().getFullYear();

const field =
  "w-full rounded-[var(--site-radius)] border border-[var(--site-border)] bg-[var(--site-surface)] px-3.5 py-2.5 text-sm text-[var(--site-text)] outline-none transition-colors placeholder:text-[var(--site-muted)] focus:border-[var(--site-primary)]";

const label = "mb-1.5 block text-xs font-medium text-[var(--site-muted)]";

/**
 * "Comece sua avaliação" — os seis campos do desenho, e só eles.
 *
 * Marca, modelo, ano, quilometragem, nome e WhatsApp. Não pede placa, e-mail
 * nem documento: nesta etapa a loja precisa saber QUAL é o carro para dar um
 * número, e cada campo a mais derruba o preenchimento.
 *
 * O que a pessoa envia vira uma avaliação em rascunho no painel, com o veículo
 * já montado — o vendedor abre a ficha começada em vez de um recado pedindo
 * para redigitar o que o cliente já digitou.
 *
 * Marca e modelo são texto livre, não lista: a consulta FIPE sai do navegador
 * e tem cota por IP, e colocá-la aqui faria o site gastar a cota da revenda em
 * visitante curioso. Quem normaliza é o vendedor, na ficha, com a FIPE do lado.
 */
export function SellCarForm({
  tenantSlug,
  initial,
}: {
  tenantSlug: string;
  /** Vem do card de troca da ficha do veículo, pela URL. */
  initial?: { brandModel?: string; years?: string; mileageKm?: string };
}) {
  // mesmo id no navegador e no servidor: a conversão conta uma vez só
  const eventId = useRef(newBrowserEventId());
  const [sent, setSent] = useState(false);
  const [phone, setPhone] = useState("");
  const [km, setKm] = useState(initial?.mileageKm ?? "");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setError(null);

    const form = new FormData(event.currentTarget);

    /*
     * "2022 / 2023" num campo só, como no desenho.
     *
     * Quem escreve um ano só quis dizer os dois iguais — é o caso mais comum,
     * e exigir os dois separados seria pedir precisão que a pessoa não tem
     * sobre o próprio carro.
     */
    const anos = String(form.get("years") ?? "")
      .split(/[^\d]+/)
      .map((parte) => Number(parte))
      .filter((ano) => ano >= 1950 && ano <= CURRENT_YEAR + 1);

    const result = await apiPost("/api/leads", {
      tenantSlug,
      kind: "venda",
      name: String(form.get("name") ?? ""),
      phone: String(form.get("phone") ?? ""),
      website: String(form.get("website") ?? ""),
      sellCar: {
        brand: String(form.get("brand") ?? ""),
        model: String(form.get("model") ?? ""),
        yearManufacture: anos[0] ?? 0,
        yearModel: anos[1] ?? anos[0] ?? 0,
        mileageKm: Number(String(form.get("mileageKm") ?? "").replace(/\D/g, "")) || 0,
      },
      utm: readUtm(),
      tracking: readTrackingContext(eventId.current),
    });

    setSending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSent(true);
    trackBrowserEvent("generate_lead", { eventId: eventId.current });
  }

  if (sent) {
    return (
      <div className="rounded-[var(--site-radius)] border border-[var(--site-success)]/30 bg-[var(--site-success)]/10 px-4 py-5 text-sm">
        <p className="font-medium text-[var(--site-success)]">Recebemos os dados do seu carro!</p>
        <p className="mt-1 text-[var(--site-muted)]">
          Nossa equipe vai avaliar e entrar em contato com uma proposta.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
      <div>
        <label className={label} htmlFor="sell-brand">
          Marca
        </label>
        <input
          id="sell-brand"
          name="brand"
          required
          defaultValue={initial?.brandModel?.split(" ")[0] ?? ""}
          placeholder="Ex.: Jeep"
          className={field}
        />
      </div>
      <div>
        <label className={label} htmlFor="sell-model">
          Modelo
        </label>
        <input
          id="sell-model"
          name="model"
          required
          defaultValue={initial?.brandModel?.split(" ").slice(1).join(" ") ?? ""}
          placeholder="Ex.: Compass"
          className={field}
        />
      </div>

      <div>
        <label className={label} htmlFor="sell-years">
          Ano / modelo
        </label>
        <input
          id="sell-years"
          name="years"
          required
          defaultValue={initial?.years ?? ""}
          placeholder="2022 / 2023"
          className={field}
        />
      </div>
      <div>
        <label className={label} htmlFor="sell-km">
          Quilometragem
        </label>
        <input
          id="sell-km"
          name="mileageKm"
          inputMode="numeric"
          placeholder="45.000"
          className={field}
          value={km}
          onChange={(event) => setKm(maskInteger(event.target.value))}
        />
      </div>

      <div>
        <label className={label} htmlFor="sell-name">
          Seu nome
        </label>
        <input id="sell-name" name="name" required placeholder="Nome completo" className={field} />
      </div>
      <div>
        <label className={label} htmlFor="sell-phone">
          WhatsApp
        </label>
        <input
          id="sell-phone"
          name="phone"
          required
          inputMode="tel"
          placeholder="(31) 99999-9999"
          className={field}
          value={phone}
          onChange={(event) => setPhone(maskPhone(event.target.value))}
        />
      </div>

      {/* honeypot: some para gente, visível para robô */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute h-0 w-0 overflow-hidden opacity-0"
      />

      {error ? <p className="text-sm text-red-600 sm:col-span-2">{error}</p> : null}

      <button
        type="submit"
        disabled={sending}
        className="rounded-[var(--site-radius)] bg-[var(--site-primary)] px-5 py-3 text-sm font-medium text-[var(--site-primary-foreground)] transition-colors hover:bg-[var(--site-primary-hover)] disabled:opacity-60 sm:col-span-2"
      >
        {sending ? "Enviando…" : "Quero avaliar meu carro"}
      </button>

      <p className="text-xs text-[var(--site-muted)] sm:col-span-2">
        Ao enviar, você autoriza o contato da loja sobre esta avaliação.
      </p>
    </form>
  );
}

/**
 * Card de troca da ficha do veículo.
 *
 * Três campos e um botão, como no desenho. Ele NÃO envia: leva para a página
 * de avaliação com o que a pessoa digitou, e lá ela completa com nome e
 * contato. Enviar daqui exigiria pedir telefone dentro da ficha de um carro —
 * dois pedidos de dado competindo na mesma tela.
 */
export function SellCarTeaser({ href }: { href: string }) {
  const [brandModel, setBrandModel] = useState("");
  const [years, setYears] = useState("");
  const [mileage, setMileage] = useState("");

  const query = new URLSearchParams();
  if (brandModel.trim()) query.set("carro", brandModel.trim());
  if (years.trim()) query.set("ano", years.trim());
  if (mileage.trim()) query.set("km", mileage.replace(/\D/g, ""));

  const dark =
    "w-full rounded-[var(--site-radius)] border border-white/15 bg-white/5 px-3.5 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-white/40 focus:border-white/40";

  return (
    <div className="grid grid-cols-1 gap-3">
      <input
        aria-label="Marca e modelo"
        className={dark}
        placeholder="Marca e modelo"
        value={brandModel}
        onChange={(event) => setBrandModel(event.target.value)}
      />
      <input
        aria-label="Ano / modelo"
        className={dark}
        placeholder="Ano / modelo"
        value={years}
        onChange={(event) => setYears(event.target.value)}
      />
      <input
        aria-label="Quilometragem aproximada"
        className={dark}
        inputMode="numeric"
        placeholder="Quilometragem aproximada"
        value={mileage}
        onChange={(event) => setMileage(event.target.value)}
      />

      <Link
        href={query.toString() ? `${href}?${query.toString()}` : href}
        className="inline-flex items-center justify-center rounded-[var(--site-radius)] bg-white px-5 py-3 text-sm font-medium text-[var(--site-text)] transition-opacity hover:opacity-90"
      >
        Avaliar meu usado
      </Link>
    </div>
  );
}
