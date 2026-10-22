import Link from "next/link";
import type { SiteLinks, VehicleView } from "../contract";
import { CardPhotos } from "../shared/card-photos";
import { WhatsappIcon } from "../shared/whatsapp-icon";

/**
 * Card do Showroom.
 *
 * Menos ruído que o do Vitrine, como pede o desenho: a foto ocupa a maior
 * parte, o selo fica sobre ela, e embaixo vêm nome, medidas, preço e dois
 * botões lado a lado — "Ver detalhes" na cor da marca e WhatsApp em verde.
 *
 * Os dois botões dividem a linha porque as duas ações competem de verdade:
 * quem já decidiu quer falar agora, quem ainda compara quer a ficha.
 */
export function VehicleCard({
  vehicle,
  links,
  storeName,
}: {
  vehicle: VehicleView;
  links: SiteLinks;
  storeName: string;
}) {
  const whatsapp = links.whatsapp(
    `Olá! Tenho interesse no ${vehicle.title} ${vehicle.yearLabel} anunciado no site da ${storeName}.`,
  );

  const medidas = [vehicle.mileageLabel, vehicle.transmissionLabel, vehicle.fuelLabel]
    .filter(Boolean)
    .join(" · ");

  return (
    <article className="flex flex-col overflow-hidden rounded-[var(--site-radius)] bg-[var(--site-surface)]">
      <div className="group relative">
        {/* tom proprio para a area da foto: no fundo da secao, que e a mesma
            cor do fundo do site, o espaco reservado sumia */}
        <CardPhotos
          photos={vehicle.photos}
          cover={vehicle.coverUrl}
          title={vehicle.title}
          href={links.vehicle(vehicle.slug)}
          frameClassName="aspect-4/3 overflow-hidden bg-[color-mix(in_srgb,var(--site-primary)_8%,var(--site-background))]"
          imageClassName="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          empty={
            <div className="flex h-full items-center justify-center text-[11px] uppercase tracking-wider text-[var(--site-muted)]">
              Foto do veículo
            </div>
          }
        />

        {/*
          O selo é da CURADORIA, não do status: é o que o desenho destaca.

          Ele tem uma pastilha atrás, como no Figma. Sem ela o texto cai
          direto sobre a foto do carro, e o contraste vira sorte: numa foto
          clara some, numa escura briga.
        */}
        <span className="pointer-events-none absolute left-3 top-3 rounded-[var(--site-radius)] bg-[var(--site-surface)]/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--site-primary)] backdrop-blur-sm">
          {vehicle.featured ? "Curadoria da loja" : vehicle.statusLabel}
        </span>
      </div>

      <div className="flex flex-1 flex-col px-4 pb-4 pt-4">
        <Link
          href={links.vehicle(vehicle.slug)}
          className="text-[15px] leading-snug transition-colors hover:text-[var(--site-primary)]"
          style={{ fontFamily: "var(--site-font-heading)" }}
        >
          {vehicle.title} {vehicle.yearModel}
        </Link>

        {medidas ? (
          <p className="mt-1.5 text-[12px] text-[var(--site-muted)]">{medidas}</p>
        ) : null}

        <p
          className="mt-2.5 text-[22px] font-semibold leading-none"
          style={{ fontFamily: "var(--site-font-heading)" }}
        >
          {vehicle.priceLabel}
        </p>

        {!vehicle.priceOnRequest ? (
          <p className="mt-1.5 text-[12px] text-[var(--site-primary)]">Financiamento disponível</p>
        ) : null}

        {/* mt-auto: cards de alturas diferentes terminam com os botões alinhados */}
        <div className="mt-auto flex gap-2 pt-4">
          <Link
            href={links.vehicle(vehicle.slug)}
            className="flex-1 rounded-[var(--site-radius)] bg-[var(--site-primary)] px-3 py-2.5 text-center text-[13px] font-medium text-[var(--site-primary-foreground)] transition-colors hover:bg-[var(--site-primary-hover)]"
          >
            Ver detalhes
          </Link>
          {whatsapp ? (
            <a
              href={whatsapp}
              data-vehicle-id={vehicle.id}
              target="_blank"
              rel="noreferrer"
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-[var(--site-radius)] bg-[var(--site-whatsapp)] px-3 py-2.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
            >
              <WhatsappIcon />
              WhatsApp
            </a>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function VehicleGrid({
  vehicles,
  links,
  storeName,
  columns = 4,
}: {
  vehicles: VehicleView[];
  links: SiteLinks;
  storeName: string;
  columns?: 3 | 4;
}) {
  const grade =
    columns === 3
      ? "sm:grid-cols-2 lg:grid-cols-3"
      : "sm:grid-cols-2 lg:grid-cols-4";

  return (
    <div className={`grid grid-cols-1 gap-5 ${grade}`}>
      {vehicles.map((vehicle) => (
        <VehicleCard
          key={vehicle.id}
          vehicle={vehicle}
          links={links}
          storeName={storeName}
        />
      ))}
    </div>
  );
}
