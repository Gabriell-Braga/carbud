import Link from "next/link";
import { Check, MapPin } from "lucide-react";
import type { VehicleDetailProps, VehicleView } from "../contract";
import { mapsEmbedUrl, vehiclePlace, vehicleStore } from "../../lib/maps";
import { PhotoGallery } from "../shared/gallery";
import { headlineHours, summarizeHours } from "../shared/hours";
import { Tabs } from "../shared/tabs";
import { StickyCta } from "../shared/sticky-cta";
import { ViewItem } from "../shared/tracking";
import { HelpBand, SHELL, SectionHeading, Shell } from "./chrome";
import { VehicleGrid } from "./vehicle-card";
import { WhatsappIcon } from "../shared/whatsapp-icon";

const GARANTIAS = [
  "Estoque atualizado",
  "Condições transparentes",
  "Atendimento humano",
  "Troca e financiamento",
];

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

export function VehicleDetail({ site, links, vehicle, related }: VehicleDetailProps) {
  const whatsapp = links.whatsapp(
    `Olá! Tenho interesse no ${vehicle.title} ${vehicle.yearLabel} anunciado no site da ${site.name}.`,
  );
  const hours = summarizeHours(site.contact.businessHours);
  const hoje = headlineHours(site.contact.businessHours);
  // carro de rede mostra a loja onde está, não a matriz
  const local = vehiclePlace(site, vehicle);
  const unidade = vehicleStore(site, vehicle);
  const mapa = mapsEmbedUrl(local);
  const cidade = [local.address.city, local.address.state]
    .filter(Boolean)
    .join(" / ");

  return (
    <Shell site={site} links={links}>
      <div className={`${SHELL} pt-6`}>
        <nav className="flex flex-wrap items-center gap-2 text-[12px] text-[var(--site-muted)]">
          <Link href={links.home} className="hover:text-[var(--site-primary)]">
            Home
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
      <section className={`${SHELL} grid grid-cols-1 gap-6 py-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]`}>
        <PhotoGallery photos={vehicle.photos} title={vehicle.title} />

        <aside className="rounded-[var(--site-radius)] border border-[var(--site-border)] p-6">
          <div className="flex flex-wrap gap-2">
            {vehicle.featured ? (
              <span className="rounded-full bg-[var(--site-primary)]/[0.08] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--site-primary)]">
                Mais buscado
              </span>
            ) : null}
            <span className="rounded-full border border-[var(--site-border)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.1em]">
              {vehicle.statusLabel}
            </span>
          </div>

          <h1
            className="mt-4 text-[26px] font-bold leading-tight"
            style={{ fontFamily: "var(--site-font-heading)" }}
          >
            {vehicle.title} {vehicle.yearModel}
          </h1>
          <p className="mt-2 text-[12px] text-[var(--site-muted)]">
            {[vehicle.mileageLabel, vehicle.transmissionLabel, vehicle.fuelLabel]
              .filter(Boolean)
              .join(" · ")}
          </p>

          <div className="my-5 border-t border-[var(--site-border)]" />

          <p
            className="text-[30px] font-bold leading-none text-[var(--site-primary)]"
            style={{ fontFamily: "var(--site-font-heading)" }}
          >
            {vehicle.priceLabel}
          </p>
          {!vehicle.priceOnRequest ? (
            <p className="mt-2 text-[12px] text-[var(--site-primary)]">Financiamento disponível</p>
          ) : null}

          {!vehicle.priceOnRequest ? (
            <div className="mt-5 rounded-[var(--site-radius)] bg-[var(--site-background)] px-4 py-3">
              <p className="text-[13px] font-medium">Simule sua compra</p>
              <p className="mt-0.5 text-[12px] text-[var(--site-muted)]">
                Entrada e prazo personalizados para seu perfil.
              </p>
            </div>
          ) : null}

          <div className="mt-5 flex flex-col gap-2.5">
            {whatsapp ? (
              <a
                href={whatsapp}
                data-vehicle-id={vehicle.id}
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 rounded-[var(--site-radius)] px-5 py-3 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: "var(--site-whatsapp)" }}
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

          {cidade ? (
            <div className="mt-5 rounded-[var(--site-radius)] border border-[var(--site-border)] px-4 py-3">
              <p className="inline-flex items-center gap-1.5 text-[13px] font-medium">
                <MapPin className="h-3.5 w-3.5 text-[var(--site-primary)]" aria-hidden="true" />
                {cidade}
              </p>
              {hoje ? <p className="mt-1 text-[12px] text-[var(--site-muted)]">{hoje}</p> : null}
            </div>
          ) : null}
        </aside>
      </section>

      {/* ------------------------------------------------------- garantias */}
      <section className={`${SHELL} pb-8`}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {GARANTIAS.map((item) => (
            <div
              key={item}
              className="flex items-center gap-2 rounded-[var(--site-radius)] border border-[var(--site-border)] px-4 py-3 text-[13px]"
            >
              <Check className="h-3.5 w-3.5 shrink-0 text-[var(--site-primary)]" aria-hidden="true" />
              {item}
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------ abas */}
      <section className={`${SHELL} pb-4`}>
        <Tabs
          items={[
            {
              id: "informacoes",
              label: "Informações",
              content: (
                <div className="rounded-[var(--site-radius)] bg-[var(--site-background)] p-6">
                  <SectionHeading
                    title="Detalhes do veículo"
                    description="Informações principais para comparar antes de falar com a loja."
                  />

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {specBoxes(vehicle).map((item) => (
                      <div
                        key={item.label}
                        className="rounded-[var(--site-radius)] border border-[var(--site-border)] bg-[var(--site-surface)] px-4 py-3"
                      >
                        <p className="text-[10px] uppercase tracking-[0.1em] text-[var(--site-muted)]">
                          {item.label}
                        </p>
                        <p className="mt-1 text-[16px] font-medium">{item.value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
                    <div className="rounded-[var(--site-radius)] border border-[var(--site-border)] bg-[var(--site-surface)] p-5">
                      <p
                        className="text-[15px] font-semibold"
                        style={{ fontFamily: "var(--site-font-heading)" }}
                      >
                        Ficha técnica
                      </p>
                      <dl className="mt-4 divide-y divide-[var(--site-border)]">
                        {specRows(vehicle).map((row) => (
                          <div
                            key={row.label}
                            className="flex items-center justify-between gap-4 py-2.5"
                          >
                            <dt className="text-[12px] text-[var(--site-muted)]">{row.label}</dt>
                            <dd className="text-[12px] font-medium">{row.value}</dd>
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
                </div>
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

      {/* --------------------------------------------------------- facilidades */}
      <section className={`${SHELL} py-12`}>
        <SectionHeading title="Facilidades para fechar negócio" />
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="rounded-[var(--site-radius)] border border-[var(--site-primary)]/20 bg-[var(--site-primary)]/[0.05] p-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--site-primary)]">
              Financiamento
            </p>
            <p
              className="mt-3 text-[19px] font-bold leading-tight"
              style={{ fontFamily: "var(--site-font-heading)" }}
            >
              Simule sua parcela
            </p>
            <p className="mt-2 text-[13px] text-[var(--site-muted)]">
              Informe entrada e prazo para receber uma estimativa antes de falar com a loja.
            </p>
            <Link
              href={`${links.financing}?veiculo=${vehicle.id}`}
              className="mt-5 inline-flex rounded-[var(--site-radius)] bg-[var(--site-primary)] px-5 py-2.5 text-[13px] font-medium text-[var(--site-primary-foreground)] transition-colors hover:bg-[var(--site-primary-hover)]"
            >
              Simular financiamento
            </Link>
          </div>

          <div className="rounded-[var(--site-radius)] border border-[var(--site-primary)]/20 bg-[var(--site-primary)]/[0.05] p-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--site-primary)]">
              Seu usado
            </p>
            <p
              className="mt-3 text-[19px] font-bold leading-tight"
              style={{ fontFamily: "var(--site-font-heading)" }}
            >
              Use seu carro na negociação
            </p>
            <p className="mt-2 text-[13px] text-[var(--site-muted)]">
              Envie os dados do seu veículo para iniciar uma avaliação de troca.
            </p>
            <Link
              href={links.sellCar}
              className="mt-5 inline-flex rounded-[var(--site-radius)] bg-[var(--site-primary)] px-5 py-2.5 text-[13px] font-medium text-[var(--site-primary-foreground)] transition-colors hover:bg-[var(--site-primary-hover)]"
            >
              Avaliar meu carro
            </Link>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- onde */}
      <section className="bg-[var(--site-background)] py-12">
        <div className={SHELL}>
          <SectionHeading
            title="Onde está este veículo"
            description="Confira a unidade e fale diretamente com a equipe."
          />
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div className="aspect-16/9 overflow-hidden rounded-[var(--site-radius)] bg-[var(--site-border)]/40">
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

            <div className="flex flex-col rounded-[var(--site-radius)] border border-[var(--site-border)] bg-[var(--site-surface)] p-6">
              <p
                className="text-[17px] font-semibold"
                style={{ fontFamily: "var(--site-font-heading)" }}
              >
                {unidade ? `${site.name} · ${unidade.name}` : site.name}
                {cidade ? ` · ${cidade}` : ""}
              </p>
              {local.address.full ? (
                <p className="mt-2 text-[12px] text-[var(--site-muted)]">
                  {local.address.full}
                </p>
              ) : null}
              <p className="mt-1 text-[12px] text-[var(--site-muted)]">
                {hours.map((line) => `${line.label}: ${line.value}`).join(" • ")}
              </p>

              {whatsapp ? (
                <a
                  href={whatsapp}
                  data-vehicle-id={vehicle.id}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-auto inline-flex items-center justify-center gap-2 rounded-[var(--site-radius)] bg-[var(--site-primary)] px-5 py-3 pt-3 text-[13px] font-medium text-[var(--site-primary-foreground)] transition-colors hover:bg-[var(--site-primary-hover)]"
                >
                  <WhatsappIcon />
                  Falar com a loja no WhatsApp
                </a>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {related.length > 0 ? (
        <section className={`${SHELL} py-12`}>
          <SectionHeading title="Você também pode gostar" />
          <VehicleGrid vehicles={related} links={links} site={site} columns={4} />
          <Link
            href={links.stock}
            className="mt-8 inline-flex rounded-[var(--site-radius)] border border-[var(--site-primary)] px-5 py-2.5 text-[13px] font-medium text-[var(--site-primary)] transition-colors hover:bg-[var(--site-primary)]/5"
          >
            Ver estoque completo
          </Link>
        </section>
      ) : null}

      <HelpBand
        site={site}
        links={links}
        title="Quer tirar uma dúvida sobre este carro?"
        description="Fale diretamente com a equipe da loja pelo WhatsApp."
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

function OptionsCard({ vehicle, plain = false }: { vehicle: VehicleView; plain?: boolean }) {
  const moldura = plain
    ? ""
    : "rounded-[var(--site-radius)] border border-[var(--site-border)] bg-[var(--site-surface)] p-5";

  if (vehicle.options.length === 0) {
    return (
      <div className={moldura}>
        <p className="text-[13px] text-[var(--site-muted)]">
          Este anúncio não teve opcionais cadastrados. A equipe confirma os itens no atendimento.
        </p>
      </div>
    );
  }

  return (
    <div className={moldura}>
      {!plain ? (
        <p className="mb-4 text-[15px] font-semibold" style={{ fontFamily: "var(--site-font-heading)" }}>
          Itens e opcionais
        </p>
      ) : null}

      <ul className="grid grid-cols-1 gap-x-5 gap-y-2 sm:grid-cols-2">
        {vehicle.options.map((option) => (
          <li
            key={option.key}
            className="flex items-center gap-2 border-b border-[var(--site-border)] py-2 text-[12px] last:border-b-0"
          >
            <Check className="h-3.5 w-3.5 shrink-0 text-[var(--site-primary)]" aria-hidden="true" />
            {option.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
