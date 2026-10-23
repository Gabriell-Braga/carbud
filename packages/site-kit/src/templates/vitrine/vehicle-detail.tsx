import Link from "next/link";
import { Check } from "lucide-react";
import type { VehicleDetailProps, VehicleView } from "../contract";
import { PhotoGallery } from "../shared/gallery";
import { summarizeHours } from "../shared/hours";
import { StickyCta } from "../shared/sticky-cta";
import { ViewItem } from "../shared/tracking";
import { mapsEmbedUrl, vehiclePlace, vehicleStore } from "../../lib/maps";
import { SHELL, SectionHeading, Shell, WhatsappButton } from "./chrome";
import { VehicleGrid } from "./vehicle-card";

/** As quatro medidas que decidem a comparação, em destaque acima da dobra. */
function specBoxes(vehicle: VehicleView) {
  return [
    { value: vehicle.mileageLabel, label: "Quilometragem" },
    { value: vehicle.yearLabel, label: "Ano / modelo" },
    { value: vehicle.transmissionLabel, label: "Câmbio" },
    { value: vehicle.fuelLabel, label: "Combustível" },
  ].filter((item) => Boolean(item.value));
}

/** Ficha técnica: só linha com valor — campo vazio vira dúvida, não neutro. */
function specRows(vehicle: VehicleView) {
  return [
    { label: "Marca", value: vehicle.brand },
    { label: "Modelo", value: vehicle.model },
    { label: "Versão", value: vehicle.version },
    { label: "Ano / modelo", value: vehicle.yearLabel },
    { label: "Quilometragem", value: vehicle.mileageLabel },
    { label: "Câmbio", value: vehicle.transmissionLabel },
    { label: "Combustível", value: vehicle.fuelLabel },
    { label: "Carroceria", value: vehicle.bodyTypeLabel },
    { label: "Cor", value: vehicle.color },
    { label: "Portas", value: vehicle.doors ? String(vehicle.doors) : null },
    { label: "Final de placa", value: vehicle.licensePlateEnd },
  ].filter((row): row is { label: string; value: string } => Boolean(row.value));
}

export function VehicleDetail({
  site,
  links,
  vehicle,
  related,
  financingForm,
  tradeInForm,
}: VehicleDetailProps) {
  const whatsapp = links.whatsapp(
    `Olá! Tenho interesse no ${vehicle.title} ${vehicle.yearLabel} anunciado no site da ${site.name}.`,
  );
  const hours = summarizeHours(site.contact.businessHours);
  // carro de rede mostra a loja onde está, não a matriz
  const local = vehiclePlace(site, vehicle);
  const unidade = vehicleStore(site, vehicle);
  const mapa = mapsEmbedUrl(local);

  return (
    <Shell site={site} links={links} active="stock">
      <div className={`${SHELL} py-6`}>
        <nav className="flex flex-wrap items-center gap-2 text-[13px] text-[var(--site-muted)]">
          <Link href={links.home} className="hover:text-[var(--site-primary)]">
            Início
          </Link>
          <span>/</span>
          <Link href={links.stock} className="hover:text-[var(--site-primary)]">
            Estoque
          </Link>
          <span>/</span>
          <span className="text-[var(--site-text)]">{vehicle.title}</span>
        </nav>
      </div>

      {/* ------------------------------------------------------------ topo */}
      <section className={`${SHELL} grid grid-cols-1 gap-8 pb-14 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]`}>
        <PhotoGallery photos={vehicle.photos} title={vehicle.title} />

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--site-success)]">
            {vehicle.statusLabel}
          </p>
          <h1
            className="mt-2 text-[32px] font-bold leading-tight text-[var(--site-text)]"
            style={{ fontFamily: "var(--site-font-heading)" }}
          >
            {vehicle.title}
          </h1>
          {vehicle.version ? (
            <p className="mt-1.5 text-[15px] text-[var(--site-muted)]">
              {vehicle.version} • {vehicle.yearModel}
            </p>
          ) : null}

          <div className="mt-6">
            {!vehicle.priceOnRequest ? (
              <p className="text-xs text-[var(--site-muted)]">Por</p>
            ) : null}
            <p
              className="text-[36px] font-bold leading-none text-[var(--site-text)]"
              style={{ fontFamily: "var(--site-font-heading)" }}
            >
              {vehicle.priceLabel}
            </p>
            {!vehicle.priceOnRequest ? (
              <p className="mt-2 text-[13px] font-medium text-[var(--site-success)]">
                Financiamento disponível • simule sem compromisso
              </p>
            ) : null}
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            {specBoxes(vehicle).map((item) => (
              <div
                key={item.label}
                className="rounded-[var(--site-radius)] border border-[var(--site-border)] bg-[var(--site-surface)] px-4 py-3"
              >
                <p className="text-sm font-semibold text-[var(--site-text)]">{item.value}</p>
                <p className="mt-0.5 text-xs text-[var(--site-muted)]">{item.label}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-col gap-2.5">
            <WhatsappButton href={whatsapp} vehicleId={vehicle.id} className="w-full !rounded-lg" />
            {!vehicle.priceOnRequest ? (
              <Link
                href={`${links.financing}?veiculo=${vehicle.id}`}
                className="inline-flex w-full items-center justify-center rounded-lg bg-[var(--site-primary)] px-5 py-2.5 text-sm font-medium text-[var(--site-primary-foreground)] transition-colors hover:bg-[var(--site-primary-hover)]"
              >
                Simular financiamento
              </Link>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-[var(--site-muted)]">
            <span className="inline-flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5 text-[var(--site-success)]" aria-hidden="true" />
              Compra segura
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5 text-[var(--site-success)]" aria-hidden="true" />
              Atendimento direto da loja
            </span>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------- detalhes */}
      <section className="border-y border-[var(--site-border)] bg-[var(--site-background)] py-14">
        <div className={SHELL}>
          <SectionHeading
            title="Detalhes do veículo"
            description="Informações principais para você comparar antes de falar com a loja."
          />

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="overflow-hidden rounded-[var(--site-radius)] border border-[var(--site-border)] bg-[var(--site-surface)]">
              <p
                className="border-b border-[var(--site-border)] px-5 py-4 text-lg font-semibold text-[var(--site-text)]"
                style={{ fontFamily: "var(--site-font-heading)" }}
              >
                Ficha técnica
              </p>
              <dl className="divide-y divide-[var(--site-border)]">
                {specRows(vehicle).map((row) => (
                  <div key={row.label} className="flex items-center justify-between gap-4 px-5 py-2.5">
                    <dt className="text-[13px] text-[var(--site-muted)]">{row.label}</dt>
                    <dd className="text-[13px] font-medium text-[var(--site-text)]">{row.value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="rounded-[var(--site-radius)] border border-[var(--site-border)] bg-[var(--site-surface)] p-5">
              <p
                className="text-lg font-semibold text-[var(--site-text)]"
                style={{ fontFamily: "var(--site-font-heading)" }}
              >
                Itens e opcionais
              </p>

              {vehicle.options.length === 0 ? (
                <p className="mt-3 text-[13px] text-[var(--site-muted)]">
                  Os opcionais deste veículo não foram detalhados. Fale com a equipe para
                  confirmar o que ele tem.
                </p>
              ) : (
                <ul className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {vehicle.options.map((option) => (
                    <li
                      key={option.key}
                      className="flex items-start gap-2 text-[13px] text-[var(--site-text)]"
                    >
                      <Check
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--site-success)]"
                        aria-hidden="true"
                      />
                      {option.label}
                    </li>
                  ))}
                </ul>
              )}

              {vehicle.description ? (
                <div className="mt-5 border-t border-[var(--site-border)] pt-5">
                  <p className="whitespace-pre-line text-[13px] leading-relaxed text-[var(--site-muted)]">
                    {vehicle.description}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------- facilite a compra */}
      <section className={`${SHELL} py-14`}>
        <SectionHeading
          title="Facilite sua compra"
          description="Simule condições e use seu carro atual como parte do pagamento."
        />

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/*
            Simulador do desenho, preenchido com o preço DESTE veículo.
            Ele não envia: leva para a página de financiamento, onde a pessoa
            completa com nome e contato.
          */}
          <div className="rounded-[var(--site-radius)] border border-[var(--site-border)] bg-[var(--site-surface)] p-6">
            <p
              className="text-lg font-semibold text-[var(--site-text)]"
              style={{ fontFamily: "var(--site-font-heading)" }}
            >
              Simule seu financiamento
            </p>
            <p className="mt-1 text-[13px] text-[var(--site-muted)]">
              Tenha uma estimativa inicial antes de falar com a equipe.
            </p>
            <div className="mt-5">{financingForm}</div>
          </div>

          <div className="rounded-[var(--site-radius)] bg-[var(--site-text)] p-6 text-white">
            <p
              className="text-lg font-semibold"
              style={{ fontFamily: "var(--site-font-heading)" }}
            >
              Seu usado pode entrar na troca
            </p>
            <p className="mt-2 text-sm leading-relaxed text-white/70">
              Informe os dados do seu carro e nossa equipe avalia uma proposta para usar como
              entrada nesta compra.
            </p>
            <div className="mt-5">{tradeInForm}</div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ loja */}
      {local.address.full || hours.length > 0 ? (
        <section className="border-y border-[var(--site-border)] bg-[var(--site-background)] py-14">
          <div className={SHELL}>
            <SectionHeading
              title="Veja o carro de perto"
              description="Visite a loja ou fale com nossa equipe para confirmar disponibilidade e agendar atendimento."
            />

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
              <div className="aspect-16/9 overflow-hidden rounded-[var(--site-radius)] border border-[var(--site-border)] bg-[var(--site-surface)]">
                {/*
                  O mesmo mapa da página de contato. Quem está decidindo ver
                  o carro quer saber a distância até a loja — um link para
                  descobrir isso adia a resposta e tira a pessoa do site.
                */}
                {mapa ? (
                  <iframe
                    src={mapa}
                    title={`Localização da ${site.name}`}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    className="h-full w-full border-0"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-[var(--site-muted)]">
                    Endereço não informado
                  </div>
                )}
              </div>

              {/* coluna: o botao desce para o pe do card em vez de deixar um
                  vazio embaixo dele quando a loja tem poucos horarios */}
              <div className="flex flex-col rounded-[var(--site-radius)] border border-[var(--site-border)] bg-[var(--site-surface)] p-6">
                <p
                  className="text-lg font-bold uppercase tracking-tight text-[var(--site-text)]"
                  style={{ fontFamily: "var(--site-font-heading)" }}
                >
                  {unidade ? `${site.name} · ${unidade.name}` : site.name}
                </p>
                {local.address.full ? (
                  <p className="mt-3 text-[13px] leading-relaxed text-[var(--site-muted)]">
                    {local.address.full}
                  </p>
                ) : null}
                {(unidade?.phone ?? site.contact.phone) ? (
                  <p className="mt-3 text-sm font-medium text-[var(--site-text)]">
                    {unidade?.phone ?? site.contact.phone}
                  </p>
                ) : null}

                <ul className="mt-3 space-y-1 text-[13px] text-[var(--site-muted)]">
                  {hours.map((line) => (
                    <li key={line.label}>
                      {line.label}: {line.value}
                    </li>
                  ))}
                </ul>

                <div className="mt-auto pt-5">
                  <WhatsappButton href={whatsapp} vehicleId={vehicle.id} className="w-full !rounded-lg" />
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* ----------------------------------------------------- relacionados */}
      {related.length > 0 ? (
        <section className={`${SHELL} py-14`}>
          <SectionHeading
            title="Você também pode gostar"
            description="Outras opções semelhantes disponíveis no estoque."
          />
          <VehicleGrid
            vehicles={related.slice(0, 4)}
            links={links}
            storeName={site.name}
            columns={4}
          />
          <div className="mt-8 flex justify-center">
            <Link
              href={links.stock}
              className="inline-flex items-center justify-center rounded-lg bg-[var(--site-primary)] px-5 py-2.5 text-sm font-medium text-[var(--site-primary-foreground)] transition-colors hover:bg-[var(--site-primary-hover)]"
            >
              Ver estoque completo
            </Link>
          </div>
        </section>
      ) : null}

      {/* a visita a ficha e o evento que a midia usa para remarketing */}
      <ViewItem
        vehicleId={vehicle.id}
        vehicleName={vehicle.title}
        value={vehicle.priceOnRequest ? null : vehicle.priceCents / 100}
      />
      <StickyCta vehicle={vehicle} links={links} storeName={site.name} />
    </Shell>
  );
}
