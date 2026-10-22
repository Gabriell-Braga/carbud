import Link from "next/link";
import type { SiteData, SiteLinks, VehicleView } from "../contract";
import { ServiceCard } from "./chrome";
import { CardPhotos } from "../shared/card-photos";
import { WhatsappIcon } from "../shared/whatsapp-icon";

/**
 * Card do Marketplace.
 *
 * Denso, para caber comparação: foto, nome, três medidas numa linha, preço em
 * destaque na cor da marca, cidade, e dois botões — cheio e contornado.
 *
 * O preço usa a cor da marca, e não o preto do texto. É o desenho de quem
 * compara: numa grade de doze cards, o preço é o que o olho procura primeiro.
 */
export function VehicleCard({
  vehicle,
  links,
  storeName,
  city,
}: {
  vehicle: VehicleView;
  links: SiteLinks;
  storeName: string;
  city: string | null;
}) {
  const whatsapp = links.whatsapp(
    `Olá! Tenho interesse no ${vehicle.title} ${vehicle.yearLabel} anunciado no site da ${storeName}.`,
  );

  const medidas = [vehicle.mileageLabel, vehicle.transmissionLabel, vehicle.fuelLabel]
    .filter(Boolean)
    .join(" · ");

  return (
    <article className="flex flex-col overflow-hidden rounded-[var(--site-radius)] border border-[var(--site-border)] bg-[var(--site-surface)] transition-shadow hover:shadow-[0_12px_32px_-20px_rgba(17,24,39,0.4)]">
      <div className="group relative">
        <CardPhotos
          photos={vehicle.photos}
          cover={vehicle.coverUrl}
          title={vehicle.title}
          href={links.vehicle(vehicle.slug)}
          frameClassName="aspect-4/3 overflow-hidden bg-[var(--site-background)]"
          imageClassName="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          empty={
            <div className="flex h-full items-center justify-center text-[11px] uppercase tracking-wider text-[var(--site-muted)]">
              Foto do veículo
            </div>
          }
        />

        {/* pastilha atras do selo: sobre a foto, texto solto perde contraste */}
        <span className="pointer-events-none absolute left-3 top-3 rounded-[var(--site-radius)] bg-[var(--site-surface)]/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--site-primary)] backdrop-blur-sm">
          {vehicle.featured ? "Mais buscado" : vehicle.statusLabel}
        </span>
      </div>

      <div className="flex flex-1 flex-col px-4 pb-4 pt-4">
        <Link
          href={links.vehicle(vehicle.slug)}
          className="text-[15px] font-semibold leading-snug transition-colors hover:text-[var(--site-primary)]"
          style={{ fontFamily: "var(--site-font-heading)" }}
        >
          {vehicle.title} {vehicle.yearModel}
        </Link>

        {medidas ? (
          <p className="mt-2.5 text-[12px] text-[var(--site-muted)]">{medidas}</p>
        ) : null}

        <p
          className="mt-1.5 text-[21px] font-bold leading-none text-[var(--site-primary)]"
          style={{ fontFamily: "var(--site-font-heading)" }}
        >
          {vehicle.priceLabel}
        </p>

        {city ? <p className="mt-1.5 text-[12px] text-[var(--site-muted)]">{city}</p> : null}

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
              /* verde fixo: o WhatsApp e marca de terceiro, e uma revenda que
                 pintasse o botao com a cor dela perderia o reconhecimento
                 instantaneo que e justamente o valor dele */
              style={{ borderColor: "var(--site-whatsapp)", color: "var(--site-whatsapp)" }}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-[var(--site-radius)] border px-3 py-2.5 text-center text-[13px] font-medium transition-opacity hover:opacity-80"
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

/**
 * Grade com cards de SERVIÇO intercalados.
 *
 * O desenho põe "Simule seu financiamento", "Seu usado vale na troca" e
 * "Precisa de ajuda?" ocupando lugares de card no meio da lista, e não numa
 * faixa separada. A diferença importa: quem está rolando uma lista longa passa
 * batido por faixa, mas lê o que aparece na mesma cadência dos carros.
 *
 * Eles entram em posições fixas e só quando há veículos suficientes para a
 * lista não virar propaganda com um carro no meio.
 */
export function VehicleGrid({
  vehicles,
  links,
  site,
  withServices = false,
  columns = 3,
}: {
  vehicles: VehicleView[];
  links: SiteLinks;
  site: SiteData;
  withServices?: boolean;
  columns?: 3 | 4;
}) {
  const cidade = [site.contact.address.city, site.contact.address.state]
    .filter(Boolean)
    .join(" / ");

  const whatsapp = links.whatsapp(`Olá! Vim pelo site da ${site.name}.`);

  const servicos = [
    {
      posicao: 4,
      node: (
        <ServiceCard
          key="servico-financiamento"
          eyebrow="Serviço da loja"
          title="Simule seu financiamento"
          text="Escolha o veículo e veja uma estimativa de entrada e parcela antes de falar com a loja."
          cta="Simular financiamento"
          href={links.financing}
        />
      ),
    },
    {
      posicao: 8,
      node: (
        <ServiceCard
          key="servico-troca"
          eyebrow="Serviço da loja"
          title="Seu usado vale na troca"
          text="Envie os dados do seu carro e receba uma avaliação para usar na negociação."
          cta="Avaliar meu carro"
          href={links.sellCar}
        />
      ),
    },
    whatsapp
      ? {
          posicao: 12,
          node: (
            <ServiceCard
              key="servico-ajuda"
              eyebrow="Precisa de ajuda?"
              title="Fale com a equipe"
              text="A equipe pode ajudar a encontrar um veículo no seu perfil, inclusive o que ainda vai chegar."
              cta="Falar no WhatsApp"
              href={whatsapp}
              external
            />
          ),
        }
      : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);

  const itens: React.ReactNode[] = [];
  vehicles.forEach((vehicle, indice) => {
    itens.push(
      <VehicleCard
        key={vehicle.id}
        vehicle={vehicle}
        links={links}
        storeName={site.name}
        city={cidade || null}
      />,
    );

    if (!withServices) return;
    const servico = servicos.find((item) => item.posicao === indice + 1);
    // só intercala se ainda vem carro depois: card de serviço no fim da lista
    // vira rodapé, e o desenho o quer no meio do fluxo
    if (servico && indice + 1 < vehicles.length) itens.push(servico.node);
  });

  const grade =
    columns === 4 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-2 lg:grid-cols-3";

  return <div className={`grid grid-cols-1 gap-5 ${grade}`}>{itens}</div>;
}
