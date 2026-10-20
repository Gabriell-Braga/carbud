"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiPost } from "../../lib/client-api";
import { DEFAULT_MONTHLY_RATE, monthlyInstallmentCents } from "../../lib/installment";
import { formatCurrency } from "../../lib/format";
import { centsToMoney, maskCpf, maskMoney, maskPhone, moneyToCents } from "../../lib/masks";
import { setSelectedVehicleLabel, useSelectedVehicleLabel } from "./financing-selection";
import { SearchableSelect } from "./searchable-select";
import { readUtm } from "./utm";
import {
  newBrowserEventId,
  readTrackingContext,
  trackBrowserEvent,
} from "./tracking";

export type FinancingVehicleOption = { id: string; label: string; priceCents: number };

export type FinancingDefaults = {
  downPaymentPercent: number;
  terms: number[];
  monthlyRatePercent?: number;
};

const field =
  "w-full rounded-[var(--site-radius)] border border-[var(--site-border)] bg-[var(--site-surface)] px-3.5 py-2.5 text-sm text-[var(--site-text)] outline-none transition-colors placeholder:text-[var(--site-muted)] focus:border-[var(--site-primary)]";

const label = "mb-1.5 block text-xs font-medium text-[var(--site-muted)]";

/**
 * Calculadora da simulação.
 *
 * Duas formas de escolher o veículo, porque o desenho tem as duas: na home a
 * pessoa escolhe um carro do estoque; na página de financiamento ela digita o
 * valor, porque pode ainda não ter escolhido nada.
 *
 * A estimativa de parcela aparece aqui, com a ressalva colada nela. Ela existe
 * porque quem procura carro compara parcela, não saldo financiado — e a
 * ressalva existe porque a taxa real sai da análise de crédito daquela pessoa,
 * que a loja não controla. As duas andam juntas: mostrar o número sem o aviso
 * seria prometer, e esconder o número seria não responder à pergunta que a
 * pessoa veio fazer.
 */
export function FinancingEstimator({
  vehicles,
  defaults,
  preselectedVehicleId,
  initialPriceCents,
  initialDownCents,
  initialInstallments,
  continueHref,
  continueLabel = "Continuar simulação",
}: {
  /** Vazio ativa o modo "digite o valor", da página de financiamento. */
  vehicles?: FinancingVehicleOption[];
  defaults: FinancingDefaults;
  preselectedVehicleId?: string;
  initialPriceCents?: number;
  initialDownCents?: number;
  initialInstallments?: number;
  continueHref: string;
  continueLabel?: string;
}) {
  const options = vehicles ?? [];
  const modoEstoque = options.length > 0;

  const [vehicleId, setVehicleId] = useState(preselectedVehicleId ?? options[0]?.id ?? "");
  const vehicle = options.find((item) => item.id === vehicleId) ?? null;

  const [priceText, setPriceText] = useState(centsToMoney(initialPriceCents ?? 0));
  const [downText, setDownText] = useState(centsToMoney(initialDownCents ?? 0));
  /*
   * Entrada vinda da tela anterior já conta como digitada.
   *
   * Sem isso o percentual padrão recalcularia por cima do valor que a pessoa
   * escolheu antes, e ela veria o próprio número ser trocado.
   */
  const [touchedDown, setTouchedDown] = useState(Boolean(initialDownCents));
  /*
   * 48 meses é o padrão do desenho, e é o prazo que a maioria escolhe.
   * Abrir em 24 mostraria a parcela mais cara possível logo de cara.
   */
  const [installments, setInstallments] = useState(
    initialInstallments && defaults.terms.includes(initialInstallments)
      ? initialInstallments
      : defaults.terms.includes(48)
        ? 48
        : (defaults.terms[0] ?? 48),
  );

  const priceCents = modoEstoque ? (vehicle?.priceCents ?? 0) : moneyToCents(priceText);

  const downCents = useMemo(() => {
    if (touchedDown) return moneyToCents(downText);
    return Math.round((priceCents * defaults.downPaymentPercent) / 100);
  }, [touchedDown, downText, priceCents, defaults.downPaymentPercent]);

  /*
   * Anuncia a escolha para o formulario de lead da mesma pagina, INCLUSIVE a
   * que ja vem marcada. Quem so olha a parcela e envia o formulario mandava um
   * lead sem veiculo nenhum, e a loja recebia "quero financiar" e nada mais.
   */
  useEffect(() => {
    if (!modoEstoque) return;
    setSelectedVehicleLabel(vehicle?.label ?? null);
  }, [modoEstoque, vehicle?.label]);

  const financedCents = Math.max(0, priceCents - downCents);
  const installmentCents = monthlyInstallmentCents(
    financedCents,
    installments,
    defaults.monthlyRatePercent ?? DEFAULT_MONTHLY_RATE,
  );

  return (
    <div className="grid grid-cols-1 gap-4">
      {modoEstoque ? (
        <div>
          <label className={label} htmlFor="est-vehicle">
            Veículo
          </label>
          {/*
            Seletor com busca: uma revenda com duzentos carros tem nomes que
            começam iguais, e rolar até achar o certo custa mais que desistir.
          */}
          <SearchableSelect
            id="est-vehicle"
            value={vehicleId}
            onChange={setVehicleId}
            options={options.map((item) => ({
              id: item.id,
              label: `${item.label} · ${formatCurrency(item.priceCents)}`,
            }))}
          />
        </div>
      ) : (
        <div>
          <label className={label} htmlFor="est-price">
            Valor do veículo
          </label>
          <input
            id="est-price"
            className={field}
            inputMode="decimal"
            placeholder="139.990,00"
            value={priceText}
            onChange={(event) => setPriceText(maskMoney(event.target.value))}
          />
        </div>
      )}

      <div>
        <label className={label} htmlFor="est-down">
          Entrada
        </label>
        <input
          id="est-down"
          className={field}
          inputMode="decimal"
          placeholder="30.000,00"
          value={touchedDown ? downText : centsToMoney(downCents)}
          onChange={(event) => {
            setTouchedDown(true);
            setDownText(maskMoney(event.target.value));
          }}
        />
      </div>

      <div>
        <label className={label} htmlFor="est-term">
          Prazo
        </label>
        <select
          id="est-term"
          className={field}
          value={installments}
          onChange={(event) => setInstallments(Number(event.target.value))}
        >
          {defaults.terms.map((term) => (
            <option key={term} value={term}>
              {term} meses
            </option>
          ))}
        </select>
      </div>

      {/*
        A ressalva é parte do número, não rodapé.
        Fica dentro do mesmo bloco para não haver como ler o valor da parcela
        sem levar junto a condição dele.
      */}
      <div className="rounded-[var(--site-radius)] bg-[var(--site-primary)]/[0.06] px-4 py-3">
        <p className="text-xs text-[var(--site-muted)]">Estimativa de parcela</p>
        <p
          className="mt-0.5 text-[20px] font-bold leading-tight text-[var(--site-text)] sm:text-[22px]"
          style={{ fontFamily: "var(--site-font-heading)" }}
        >
          {installmentCents
            ? `A partir de ${formatCurrency(installmentCents)}/mês*`
            : "Informe o valor do veículo"}
        </p>
        <p className="mt-1 text-[11px] text-[var(--site-muted)]">
          *Exemplo ilustrativo. Sujeito à análise de crédito.
        </p>
        {financedCents > 0 ? (
          <p className="mt-2 border-t border-[var(--site-border)] pt-2 text-xs text-[var(--site-muted)]">
            A financiar:{" "}
            <span className="font-medium text-[var(--site-text)]">
              {formatCurrency(financedCents)}
            </span>
          </p>
        ) : null}
      </div>

      <Link
        href={continueUrl(continueHref, {
          veiculo: modoEstoque ? vehicleId : undefined,
          valor: modoEstoque ? undefined : priceCents,
          entrada: downCents,
          prazo: installments,
        })}
        className="inline-flex items-center justify-center rounded-[var(--site-radius)] bg-[var(--site-primary)] px-5 py-3 text-sm font-medium text-[var(--site-primary-foreground)] transition-colors hover:bg-[var(--site-primary-hover)]"
      >
        {continueLabel}
      </Link>
    </div>
  );
}

/**
 * O formulário que de fato envia: "Continue sua simulação".
 *
 * Os campos são os do desenho. Sobre o CPF: ele é pedido porque a análise de
 * crédito precisa dele, e é isso que o botão promete — mas fica OPCIONAL, e a
 * pessoa consegue enviar sem. Bloquear o envio por causa dele transformaria um
 * lead morno em nenhum lead.
 */
export function FinancingLeadForm({
  tenantSlug,
  vehicleLabel,
  downPaymentCents,
  installments,
}: {
  tenantSlug: string;
  vehicleLabel?: string;
  downPaymentCents: number;
  installments: number;
}) {
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [phone, setPhone] = useState("");
  const [cpf, setCpf] = useState("");
  // mesmo id no navegador e no servidor: a conversão conta uma vez só
  const eventId = useRef(newBrowserEventId());

  /*
   * O veiculo acompanha o simulador ate a pessoa escrever o proprio texto.
   *
   * Depois disso ela manda: trocar o campo por baixo apagaria o que ela
   * digitou, que e o erro que a trava de "entrada" ja evita logo acima.
   */
  const selecionado = useSelectedVehicleLabel();
  const [vehicleText, setVehicleText] = useState(vehicleLabel ?? "");
  const [vehicleTocado, setVehicleTocado] = useState(false);
  const vehicleValue = vehicleTocado ? vehicleText : (selecionado ?? vehicleLabel ?? "");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const extras = [
      String(form.get("vehicleLabel") ?? "").trim()
        ? `Veículo de interesse: ${form.get("vehicleLabel")}`
        : "",
      String(form.get("cpf") ?? "").trim() ? `CPF: ${form.get("cpf")}` : "",
      String(form.get("schedule") ?? "").trim() ? `Melhor horário: ${form.get("schedule")}` : "",
    ].filter(Boolean);

    const result = await apiPost("/api/leads", {
      tenantSlug,
      kind: "financiamento",
      name: String(form.get("name") ?? ""),
      phone: String(form.get("phone") ?? ""),
      email: String(form.get("email") ?? ""),
      message: extras.join("\n"),
      website: String(form.get("website") ?? ""),
      financing: { downPaymentCents, installments },
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
        <p className="font-medium text-[var(--site-success)]">Solicitação enviada!</p>
        <p className="mt-1 text-[var(--site-muted)]">
          A loja vai retornar com as condições disponíveis para o seu perfil.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
      <div>
        <label className={label} htmlFor="fin-name">
          Nome completo
        </label>
        <input id="fin-name" name="name" required placeholder="Seu nome" className={field} />
      </div>
      <div>
        <label className={label} htmlFor="fin-phone">
          WhatsApp
        </label>
        <input
          id="fin-phone"
          name="phone"
          required
          inputMode="tel"
          placeholder="(31) 99999-9999"
          className={field}
          value={phone}
          onChange={(event) => setPhone(maskPhone(event.target.value))}
        />
      </div>

      <div>
        <label className={label} htmlFor="fin-email">
          E-mail
        </label>
        <input
          id="fin-email"
          name="email"
          type="email"
          placeholder="voce@email.com"
          className={field}
        />
      </div>
      <div>
        <label className={label} htmlFor="fin-cpf">
          CPF <span className="opacity-60">(opcional)</span>
        </label>
        <input
          id="fin-cpf"
          name="cpf"
          inputMode="numeric"
          placeholder="000.000.000-00"
          autoComplete="off"
          className={field}
          value={cpf}
          onChange={(event) => setCpf(maskCpf(event.target.value))}
        />
      </div>

      <div>
        <label className={label} htmlFor="fin-vehicle-label">
          Veículo de interesse
        </label>
        <input
          id="fin-vehicle-label"
          name="vehicleLabel"
          value={vehicleValue}
          onChange={(event) => {
            setVehicleTocado(true);
            setVehicleText(event.target.value);
          }}
          placeholder="Jeep Compass Longitude 2024"
          className={field}
        />
      </div>
      <div>
        <label className={label} htmlFor="fin-schedule">
          Melhor horário
        </label>
        <select id="fin-schedule" name="schedule" className={field} defaultValue="">
          <option value="">Selecione</option>
          <option value="Manhã">Manhã</option>
          <option value="Tarde">Tarde</option>
          <option value="Noite">Noite</option>
          <option value="Qualquer horário">Qualquer horário</option>
        </select>
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
        {sending ? "Enviando…" : "Solicitar contato"}
      </button>

      <p className="text-xs text-[var(--site-muted)] sm:col-span-2">
        Ao enviar, você autoriza o contato da loja sobre esta solicitação.
      </p>
    </form>
  );
}

function continueUrl(
  base: string,
  params: { veiculo?: string; valor?: number; entrada: number; prazo: number },
): string {
  const query = new URLSearchParams();
  if (params.veiculo) query.set("veiculo", params.veiculo);
  if (params.valor && params.valor > 0) query.set("valor", String(params.valor));
  if (params.entrada > 0) query.set("entrada", String(params.entrada));
  query.set("prazo", String(params.prazo));
  return `${base}?${query.toString()}`;
}
