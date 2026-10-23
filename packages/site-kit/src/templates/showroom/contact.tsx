import Link from "next/link";
import type { ContactProps } from "../contract";
import { mapsEmbedUrl } from "../../lib/maps";
import { StoreCards } from "../shared/store-cards";
import { summarizeHours } from "../shared/hours";
import { SHELL, SectionHeading, Shell, TalkBand } from "./chrome";
import { WhatsappIcon } from "../shared/whatsapp-icon";

export function Contact({ site, links, contactForm }: ContactProps) {
  const hours = summarizeHours(site.contact.businessHours);
  const whatsapp = links.whatsapp(`Olá! Vim pelo site da ${site.name}.`);
  const mapa = mapsEmbedUrl(site.contact);

  const canais = [
    whatsapp && site.contact.whatsapp
      ? {
          title: "WhatsApp",
          text: "Atendimento rápido para dúvidas e interesse em veículos.",
          value: site.contact.whatsapp,
          href: whatsapp,
          external: true,
        }
      : null,
    site.contact.phone
      ? {
          title: "Telefone",
          text: "Fale com a equipe durante o horário de atendimento.",
          value: site.contact.phone,
          href: `tel:${site.contact.phone.replace(/\D/g, "")}`,
          external: false,
        }
      : null,
    site.contact.email
      ? {
          title: "E-mail",
          text: "Para mensagens e documentos que não precisam de resposta imediata.",
          value: site.contact.email,
          href: `mailto:${site.contact.email}`,
          external: false,
        }
      : null,
  ].filter((canal): canal is NonNullable<typeof canal> => canal !== null);

  return (
    <Shell site={site} links={links}>
      {/* ----------------------------------------------------------- herói */}
      <section className="bg-[var(--site-background)] py-14">
        <div
          className={`${SHELL} grid grid-cols-1 items-start gap-10 lg:grid-cols-[minmax(0,1fr)_480px]`}
        >
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--site-primary)]">
              Contato
            </p>
            <h1
              className="mt-3 text-[40px] leading-[1.1]"
              style={{ fontFamily: "var(--site-font-heading)" }}
            >
              Fale com a nossa equipe.
            </h1>
            <p className="mt-4 max-w-[48ch] text-[14px] leading-relaxed text-[var(--site-muted)]">
              Escolha o canal que fizer mais sentido. Nossa equipe ajuda com veículos,
              financiamento, avaliação do seu carro e informações sobre a loja.
            </p>

            {/* cada canal é um alvo inteiro: o clique é no canal, não no texto */}
            <div className="mt-7 grid gap-3">
              {canais.map((canal) => (
                <a
                  key={canal.title}
                  href={canal.href}
                  {...(canal.external ? { target: "_blank", rel: "noreferrer" } : {})}
                  className="rounded-[var(--site-radius)] bg-[var(--site-surface)] px-5 py-4 transition-colors hover:text-[var(--site-primary)]"
                >
                  <p className="text-[14px] font-medium">{canal.title}</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-[var(--site-muted)]">
                    {canal.text}
                  </p>
                  <p className="mt-2 text-[13px] text-[var(--site-primary)]">{canal.value}</p>
                </a>
              ))}
            </div>
          </div>

          <div className="rounded-[var(--site-radius)] bg-[var(--site-surface)] p-6">
            <p className="text-[17px]" style={{ fontFamily: "var(--site-font-heading)" }}>
              Envie uma mensagem
            </p>
            <p className="mt-1 text-[12px] text-[var(--site-muted)]">
              Preencha os dados abaixo e a loja retorna pelo canal informado.
            </p>
            <div className="mt-5">{contactForm}</div>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------- visite a loja */}
      <section className={`${SHELL} py-14`}>
        <SectionHeading
          title="Visite nossa loja"
          description="Confira endereço, horários e canais de atendimento antes de vir até aqui."
        />

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
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

          <div className="flex flex-col rounded-[var(--site-radius)] bg-[var(--site-text)] p-6 text-white">
            <p
              className="text-[15px] uppercase tracking-[0.1em]"
              style={{ fontFamily: "var(--site-font-heading)" }}
            >
              {site.name}
            </p>

            {site.contact.address.full ? (
              <p className="mt-3 text-[12px] leading-relaxed text-white/60">
                {site.contact.address.full}
              </p>
            ) : null}

            {hours.length > 0 ? (
              <>
                <p className="mt-5 text-[13px] font-medium">Horário de atendimento</p>
                <ul className="mt-2 space-y-1 text-[12px] text-white/60">
                  {hours.map((line) => (
                    <li key={line.label}>
                      {line.label}: {line.value}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}

            {site.contact.phone ? (
              <p className="mt-5 text-[12px] text-white/60">{site.contact.phone}</p>
            ) : null}
            {site.contact.email ? (
              <p className="text-[12px] text-white/60">{site.contact.email}</p>
            ) : null}

            {whatsapp ? (
              <a
                href={whatsapp}
                target="_blank"
                rel="noreferrer"
                className="mt-auto inline-flex w-full items-center justify-center gap-2 rounded-[var(--site-radius)] bg-[var(--site-whatsapp)] px-5 py-3 pt-3 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
              >
                <WhatsappIcon />
                Falar no WhatsApp
              </a>
            ) : null}
          </div>
        </div>
      </section>

      {(site.stores?.length ?? 0) > 1 ? (
        <section className={`${SHELL} pb-14`}>
          <SectionHeading
            title="Nossas unidades"
            description="Endereço e contato de cada loja da rede."
          />
          <StoreCards site={site} />
        </section>
      ) : null}

      {/* ------------------------------------------------ como podemos ajudar */}
      <section className="bg-[var(--site-background)] py-14">
        <div className={SHELL}>
          <SectionHeading
            title="Como podemos ajudar?"
            description="Vá direto para a área mais relacionada ao que você precisa."
          />
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {[
              {
                title: "Quero comprar um carro",
                text: "Veja o estoque e filtre por marca, modelo e perfil.",
                href: links.stock,
                cta: "Ver estoque",
              },
              {
                title: "Quero financiar",
                text: "Simule entrada e prazo e envie seus dados para a loja.",
                href: links.financing,
                cta: "Simular financiamento",
              },
              {
                title: "Quero vender meu carro",
                text: "Informe os dados do veículo e receba uma avaliação.",
                href: links.sellCar,
                cta: "Avaliar meu carro",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="flex flex-col rounded-[var(--site-radius)] bg-[var(--site-surface)] p-6"
              >
                <p className="text-[14px] font-medium">{item.title}</p>
                <p className="mt-2 text-[12px] leading-relaxed text-[var(--site-muted)]">
                  {item.text}
                </p>
                <Link
                  href={item.href}
                  className="mt-auto pt-5 text-[13px] text-[var(--site-primary)] hover:underline"
                >
                  {item.cta} →
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <TalkBand
        site={site}
        links={links}
        title="Precisa de uma resposta rápida?"
        description="Fale direto com a equipe pelo WhatsApp durante o horário de atendimento."
      />
    </Shell>
  );
}
