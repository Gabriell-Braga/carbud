import Link from "next/link";
import type { SiteLinks, VehicleView } from "../contract";
import { WhatsappIcon } from "../shared/whatsapp-icon";

/**
 * Card de veículo do template Vitrine.
 *
 * Duas ações explícitas, não um card inteiro clicável: o desenho pede "Ver
 * detalhes" e "Falar no WhatsApp" lado a lado, e são intenções diferentes —
 * quem já decidiu quer o WhatsApp, quem está comparando quer a ficha. Um card
 * clicável inteiro roubaria o clique do WhatsApp para a ficha.
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

  return (
    <article className="flex flex-col overflow-hidden rounded-[var(--site-radius)] border border-[var(--site-border)] bg-[var(--site-surface)]">
      <Link href={links.vehicle(vehicle.slug)} className="group relative block">
        <div className="relative aspect-4/3 overflow-hidden bg-[var(--site-background)]">
          {vehicle.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={vehicle.coverUrl}
              alt={vehicle.title}
              loading="lazy"
              /*
               * O fundo cobre a falha de carregamento.
               *
               * Foto apagada do armazenamento vira o icone de imagem quebrada do
               * navegador — um retangulo berrante no meio da grade. Com o fundo
               * da propria area, a falha vira um espaco neutro, do mesmo tom do
               * "Sem foto" ao lado.
               */
              className="h-full w-full bg-[var(--site-background)] object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-[var(--site-muted)]">
              Sem foto
            </div>
          )}
        </div>

        <Badge vehicle={vehicle} />
      </Link>

      <div className="flex flex-1 flex-col p-4">
        {/*
          Altura fixa de duas linhas.
          Sem isso, um "Compass Longitude 1.3 T270 Turbo Flex AT6" ao lado de um
          "Kwid Intense 1.0" empurra o preço para baixo em um card e não no
          outro, e a grade perde o alinhamento onde o olho compara: a linha do
          preço.
        */}
        <h3
          className="line-clamp-2 min-h-[2.75rem] text-[17px] font-semibold leading-snug text-[var(--site-text)]"
          style={{ fontFamily: "var(--site-font-heading)" }}
        >
          <Link href={links.vehicle(vehicle.slug)}>{vehicle.title}</Link>
        </h3>

        {/* ano · km · câmbio, na ordem que a pessoa compara */}
        <p className="mt-1.5 text-[13px] text-[var(--site-muted)]">
          {[cardYear(vehicle), vehicle.mileageLabel, vehicle.transmissionLabel]
            .filter(Boolean)
            .join(" • ")}
        </p>

        <p
          className="mt-3 text-[22px] font-bold leading-none text-[var(--site-text)]"
          style={{ fontFamily: "var(--site-font-heading)" }}
        >
          {vehicle.priceLabel}
        </p>

        {/*
          "Financiamento disponível" só aparece com preço.
          Em veículo sob consulta não há valor para financiar, e a frase
          prometeria uma conta que a página seguinte não consegue fazer.
        */}
        {!vehicle.priceOnRequest ? (
          <p className="mt-1.5 text-xs font-medium text-[var(--site-success)]">
            Financiamento disponível
          </p>
        ) : null}

        <div className="mt-4 flex flex-col gap-2">
          <Link
            href={links.vehicle(vehicle.slug)}
            className="inline-flex items-center justify-center rounded-lg bg-[var(--site-primary)] px-4 py-2.5 text-sm font-medium text-[var(--site-primary-foreground)] transition-colors hover:bg-[var(--site-primary-hover)]"
          >
            Ver detalhes
          </Link>

          {whatsapp ? (
            <a
              href={whatsapp}
              data-vehicle-id={vehicle.id}
              target="_blank"
              rel="noreferrer"
              style={{ backgroundColor: "var(--site-whatsapp)" }}
              className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              <WhatsappIcon />
              Falar no WhatsApp
            </a>
          ) : null}
        </div>
      </div>
    </article>
  );
}

/**
 * Ano do card: "2024", não "2024/2024".
 *
 * O par só informa quando fabricação e modelo diferem — que é o caso que
 * muda o preço. Repetir o mesmo número dos dois lados gasta metade da linha
 * de comparação para não dizer nada.
 */
function cardYear(vehicle: VehicleView): string {
  return vehicle.yearManufacture === vehicle.yearModel
    ? String(vehicle.yearModel)
    : vehicle.yearLabel;
}

/**
 * Selo do card. Reservado vence destaque.
 *
 * Um carro reservado marcado como "Destaque" convida ao clique e termina em
 * decepção; a informação que muda a decisão é a de que ele já tem dono.
 */
function Badge({ vehicle }: { vehicle: VehicleView }) {
  const badge =
    vehicle.status === "reserved"
      ? { label: "Reservado", className: "bg-[var(--site-text)] text-white" }
      : vehicle.featured
        ? { label: "Destaque", className: "bg-[var(--site-surface)] text-[var(--site-text)]" }
        : null;

  if (!badge) return null;

  return (
    <span
      className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-xs font-medium shadow-sm ${badge.className}`}
    >
      {badge.label}
    </span>
  );
}

/** Grade padrão de cards — três colunas no desktop, como o desenho. */
export function VehicleGrid({
  vehicles,
  links,
  storeName,
  columns = 3,
}: {
  vehicles: VehicleView[];
  links: SiteLinks;
  storeName: string;
  columns?: 3 | 4;
}) {
  return (
    <div
      className={`grid grid-cols-1 gap-5 sm:grid-cols-2 ${columns === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}
    >
      {vehicles.map((vehicle) => (
        <VehicleCard key={vehicle.id} vehicle={vehicle} links={links} storeName={storeName} />
      ))}
    </div>
  );
}
