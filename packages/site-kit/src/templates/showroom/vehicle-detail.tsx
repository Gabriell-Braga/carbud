import Link from "next/link";
import { Check } from "lucide-react";
import type { VehicleDetailProps, VehicleView } from "../contract";
import { formatCurrency } from "../../lib/format";
import { mapsEmbedUrl, vehiclePlace, vehicleStore } from "../../lib/maps";
import { PhotoGallery } from "../shared/gallery";
import { summarizeHours } from "../shared/hours";
import { SHELL, SectionHeading, Shell, TalkBand } from "./chrome";
import { Tabs } from "../shared/tabs";
import { StickyCta } from "../shared/sticky-cta";
import { ViewItem } from "../shared/tracking";
import { VehicleGrid } from "./vehicle-card";
import { WhatsappIcon } from "../shared/whatsapp-icon";

function specBoxes(vehicle: VehicleView) {
  return [
    { label: "Quilometragem", value: vehicle.mileageLabel },
    { label: "Ano / modelo", value: vehicle.yearLabel },
    { label: "Câmbio", value: vehicle.transmissionLabel },
    { label: "Combustível", value: vehicle.fuelLabel },
  ].filter((item): item is { label: string; value: string } => Boolean(item.value));
}

function specRows(vehicle: VehicleView) {
  return [
    { label: "Marca", value: vehicle.brand },
    { label: "Modelo", value: vehicle.model },
    { label: "Versão", value: vehicle.version },
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
  const entrada = Math.round((vehicle.priceCents * site.financing.downPaymentPercent) / 100);
  const prazo = site.financing.terms.includes(48) ? 48 : (site.financing.terms[0] ?? 48);

  return (
    <Shell site={site} links={links}>
      <div className={`${SHELL} pt-6`}>
        <nav className="flex flex-wrap items-center gap-2 text-[12px] text-[var(--site-muted)]">
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
      <section className="bg-[var(--site-background)] pb-14 pt-6">
        <div className={`${SHELL} grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]`}>
          <PhotoGallery photos={vehicle.photos} title={vehicle.title} />

          <aside className="rounded-[var(--site-radius)] bg-[var(--site-surface)] p-6">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-[var(--site-primary)]/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--site-primary)]">
                Seminovo · {vehicle.statusLabel}
              </span>
            </div>

            <h1
              className="mt-4 text-[28px] leading-tight"
              style={{ fontFamily: "var(--site-font-heading)" }}
            >
              {vehicle.title}
            </h1>
            {vehicle.version ? (
              <p className="mt-1.5 text-[13px] text-[var(--site-muted)]">
                {vehicle.version} • {vehicle.yearModel}
              </p>
            ) : null}

            <div className="my-5 border-t border-[var(--site-border)]" />

            <p
              className="text-[32px] font-semibold leading-none"
              style={{ fontFamily: "var(--site-font-heading)" }}
            >
              {vehicle.priceLabel}
            </p>
            {!vehicle.priceOnRequest ? (
              <p className="mt-2 text-[12px] text-[var(--site-primary)]">
                Financiamento disponível • simule sem compromisso
              </p>
            ) : null}

            <div className="mt-5 grid grid-cols-2 gap-3">
              {specBoxes(vehicle).map((item) => (
                <div
                  key={item.label}
                  className="rounded-[var(--site-radius)] border border-[var(--site-border)] px-3.5 py-2.5"
                >
                  <p className="text-[13px] font-medium">{item.value}</p>
                  <p className="mt-0.5 text-[11px] text-[var(--site-muted)]">{item.label}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 flex flex-col gap-2.5">
              {whatsapp ? (
                <a
                  href={whatsapp}
                  data-vehicle-id={vehicle.id}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-[var(--site-radius)] bg-[var(--site-whatsapp)] px-5 py-3 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
                >
                  <WhatsappIcon />
                  Falar no WhatsApp
                </a>
              ) : null}
              {!vehicle.priceOnRequest ? (
                <Link
                  href={`${links.financing}?veiculo=${vehicle.id}`}
                  className="inline-flex w-full items-center justify-center rounded-[var(--site-radius)] border border-[var(--site-primary)] px-5 py-3 text-[13px] font-medium text-[var(--site-primary)] transition-colors hover:bg-[var(--site-primary)]/5"
                >
                  Simular financiamento
                </Link>
              ) : null}
            </div>

            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--site-muted)]">
              <span className="inline-flex items-center gap-1">
                <Check className="h-3 w-3 text-[var(--site-success)]" aria-hidden="true" />
                Compra segura
              </span>
              <span className="inline-flex items-center gap-1">
                <Check className="h-3 w-3 text-[var(--site-success)]" aria-hidden="true" />
                Atendimento direto da loja
              </span>
            </div>
          </aside>
        </div>
      </section>

      {/* ------------------------------------------------------------ abas */}
      <section className={`${SHELL} py-12`}>
        <Tabs
          items={[
            {
              id: "informacoes",
              label: "Informações",
              content: (
                <>
                  <SectionHeading
                    title="Detalhes do veículo"
                    description="Informações principais para você comparar antes de falar com a loja."
                  />

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {specBoxes(vehicle).map((item) => (
                      <div
                        key={item.label}
                        className="rounded-[var(--site-radius)] border border-[var(--site-border)] px-4 py-3"
                      >
                        <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--site-muted)]">
                          {item.label}
                        </p>
                        <p className="mt-1 text-[17px]">{item.value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
                    <div className="rounded-[var(--site-radius)] border border-[var(--site-border)] p-5">
                      <p className="text-[15px]" style={{ fontFamily: "var(--site-font-heading)" }}>
                        Ficha técnica
                      </p>
                      <dl className="mt-4 divide-y divide-[var(--site-border)]">
                        {specRows(vehicle).map((row) => (
                          <div
                            key={row.label}
                            className="flex items-center justify-between gap-4 py-2.5"
                          >
                            <dt className="text-[12px] text-[var(--site-muted)]">{row.label}</dt>
                            <dd className="text-[12px]">{row.value}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>

                    <OptionsCard vehicle={vehicle} />
                  </div>

                  {vehicle.description ? (
                    <p className="mt-5 max-w-[70ch] text-[13px] leading-relaxed text-[var(--site-muted)]">
                      {vehicle.description}
                    </p>
                  ) : null}
                </>
              ),
            },
            {
              id: "galeria",
              label: "Galeria",
              content:
                vehicle.photos.length > 0 ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {vehicle.photos.map((photo) => (
                      <div
                        key={photo.id}
                        className="aspect-4/3 overflow-hidden rounded-[var(--site-radius)] bg-[var(--site-background)]"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={photo.card}
                          alt={vehicle.title}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[13px] text-[var(--site-muted)]">
                    Este anúncio ainda não tem fotos. Fale com a loja para receber as imagens.
                  </p>
                ),
            },
            {
              id: "opcionais",
              label: "Opcionais",
              content: <OptionsCard vehicle={vehicle} plain />,
            },
          ]}
        />
      </section>

      {/* ------------------------------------------------- facilite a compra */}
      <section className="bg-[var(--site-background)] py-14">
        <div className={SHELL}>
          <SectionHeading
            title="Facilite sua compra"
            description="Simule condições e use seu carro atual como parte do pagamento."
          />

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="rounded-[var(--site-radius)] bg-[var(--site-surface)] p-6">
              <p className="text-[15px]" style={{ fontFamily: "var(--site-font-heading)" }}>
                Simule seu financiamento
              </p>
              <p className="mt-1 text-[12px] text-[var(--site-muted)]">
                Tenha uma estimativa inicial antes de falar com a equipe.
              </p>

              {/*
                Resumo, e não calculadora: é o que o desenho pede aqui. A conta
                de verdade acontece na página de financiamento, com o veículo
                já selecionado pelo link abaixo.
              */}
              <dl className="mt-5 divide-y divide-[var(--site-border)] text-[13px]">
                <div className="flex items-center justify-between py-2.5">
                  <dt className="text-[var(--site-muted)]">Valor do veículo</dt>
                  <dd>{vehicle.priceLabel}</dd>
                </div>
                <div className="flex items-center justify-between py-2.5">
                  <dt className="text-[var(--site-muted)]">Entrada</dt>
                  <dd>{formatCurrency(entrada)}</dd>
                </div>
                <div className="flex items-center justify-between py-2.5">
                  <dt className="text-[var(--site-muted)]">Prazo</dt>
                  <dd>{prazo} meses</dd>
                </div>
              </dl>

              <Link
                href={`${links.financing}?veiculo=${vehicle.id}`}
                className="mt-5 inline-flex rounded-[var(--site-radius)] bg-[var(--site-primary)] px-5 py-2.5 text-[13px] font-medium text-[var(--site-primary-foreground)] transition-colors hover:bg-[var(--site-primary-hover)]"
              >
                Simular condições
              </Link>
            </div>

            <div className="rounded-[var(--site-radius)] bg-[var(--site-surface)] p-6">
              <p className="text-[15px]" style={{ fontFamily: "var(--site-font-heading)" }}>
                Seu usado pode entrar na troca
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-[var(--site-muted)]">
                Informe os dados do seu carro e nossa equipe avalia uma proposta para usar como
                entrada.
              </p>
              <div className="mt-5">{tradeInForm}</div>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ loja */}
      <section className={`${SHELL} grid grid-cols-1 gap-6 py-14 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]`}>
        <div className="aspect-16/9 overflow-hidden rounded-[var(--site-radius)] bg-[var(--site-background)]">
          {mapa ? (
            <iframe
              src={mapa}
              title={`Localização da ${site.name}`}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="h-full w-full border-0"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-[12px] text-[var(--site-muted)]">
              Endereço não informado
            </div>
          )}
        </div>

        <div className="flex flex-col">
          <h2 className="text-[24px] leading-tight" style={{ fontFamily: "var(--site-font-heading)" }}>
            Veja o carro de perto
          </h2>
          <p className="mt-2 max-w-[44ch] text-[13px] leading-relaxed text-[var(--site-muted)]">
            Visite a loja ou fale com nossa equipe para confirmar disponibilidade e agendar
            atendimento.
          </p>

          <p className="mt-5 text-[13px] font-medium uppercase tracking-[0.1em]">
            {unidade ? `${site.name} · ${unidade.name}` : site.name}
          </p>
          {local.address.full ? (
            <p className="mt-2 text-[12px] text-[var(--site-muted)]">{local.address.full}</p>
          ) : null}
          {(unidade?.phone ?? site.contact.phone) ? (
            <p className="mt-2 text-[13px]">{unidade?.phone ?? site.contact.phone}</p>
          ) : null}
          <p className="mt-2 text-[12px] text-[var(--site-muted)]">
            {hours.map((line) => `${line.label}: ${line.value}`).join(" • ")}
          </p>

          {whatsapp ? (
            <a
              href={whatsapp}
              data-vehicle-id={vehicle.id}
              target="_blank"
              rel="noreferrer"
              className="mt-auto inline-flex w-fit items-center gap-2 rounded-[var(--site-radius)] bg-[var(--site-whatsapp)] px-5 py-3 pt-3 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
            >
              <WhatsappIcon />
              Falar no WhatsApp
            </a>
          ) : null}
        </div>
      </section>

      {/* ------------------------------------------------------ relacionados */}
      {related.length > 0 ? (
        <section className="bg-[var(--site-background)] py-14">
          <div className={SHELL}>
            <SectionHeading
              title="Você também pode gostar"
              description="Outras opções semelhantes disponíveis no estoque."
            />
            <VehicleGrid vehicles={related} links={links} storeName={site.name} columns={4} />
            <Link
              href={links.stock}
              className="mt-8 inline-flex rounded-[var(--site-radius)] border border-[var(--site-border)] bg-[var(--site-surface)] px-5 py-2.5 text-[13px] font-medium transition-colors hover:border-[var(--site-primary)]"
            >
              Ver estoque completo
            </Link>
          </div>
        </section>
      ) : null}

      <TalkBand
        site={site}
        links={links}
        title="Ainda ficou alguma dúvida?"
        description="Fale com a equipe sobre este veículo, financiamento ou troca."
      />

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

/** Opcionais em duas colunas, com check — o mesmo bloco serve à aba e à ficha. */
function OptionsCard({ vehicle, plain = false }: { vehicle: VehicleView; plain?: boolean }) {
  if (vehicle.options.length === 0) {
    return (
      <div className={plain ? "" : "rounded-[var(--site-radius)] border border-[var(--site-border)] p-5"}>
        <p className="text-[13px] text-[var(--site-muted)]">
          Este anúncio não teve opcionais cadastrados. A equipe confirma os itens no atendimento.
        </p>
      </div>
    );
  }

  return (
    <div className={plain ? "" : "rounded-[var(--site-radius)] border border-[var(--site-border)] p-5"}>
      {!plain ? (
        <p className="mb-4 text-[15px]" style={{ fontFamily: "var(--site-font-heading)" }}>
          Itens e opcionais
        </p>
      ) : null}

      <ul className="grid grid-cols-1 gap-x-5 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
        {vehicle.options.map((option) => (
          <li key={option.key} className="flex items-center gap-2 text-[12px]">
            <Check className="h-3.5 w-3.5 shrink-0 text-[var(--site-success)]" aria-hidden="true" />
            {option.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
