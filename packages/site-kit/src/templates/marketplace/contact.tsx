import Link from "next/link";
import type { ContactProps } from "../contract";
import { mapsEmbedUrl } from "../../lib/maps";
import { summarizeHours } from "../shared/hours";
import { HelpBand, SHELL, SectionHeading, Shell } from "./chrome";
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
      <section className="bg-[var(--site-background)] py-12">
        <div
          className={`${SHELL} grid grid-cols-1 items-start gap-10 lg:grid-cols-[minmax(0,1fr)_480px]`}
        >
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--site-primary)]">
              Contato
            </p>
            <h1
              className="mt-3 text-[36px] font-bold leading-[1.1]"
              style={{ fontFamily: "var(--site-font-heading)" }}
            >
              Fale com a nossa equipe
            </h1>
            <p className="mt-4 max-w-[48ch] text-[14px] leading-relaxed text-[var(--site-muted)]">
              Escolha o canal que fizer mais sentido. A equipe ajuda com veículos, financiamento,
              avaliação do seu carro e informações sobre a loja.
            </p>

            <div className="mt-7 grid gap-3">
              {canais.map((canal) => (
                <a
                  key={canal.title}
                  href={canal.href}
                  {...(canal.external ? { target: "_blank", rel: "noreferrer" } : {})}
                  className="rounded-[var(--site-radius)] border border-[var(--site-border)] bg-[var(--site-surface)] px-5 py-4 transition-colors hover:border-[var(--site-primary)]"
                >
                  <p className="text-[14px] font-medium">{canal.title}</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-[var(--site-muted)]">
                    {canal.text}
                  </p>
                  <p className="mt-2 text-[13px] font-medium text-[var(--site-primary)]">
                    {canal.value}
                  </p>
                </a>
              ))}
            </div>
          </div>

          <div className="rounded-[var(--site-radius)] border border-[var(--site-border)] bg-[var(--site-surface)] p-6">
            <p className="text-[16px] font-semibold" style={{ fontFamily: "var(--site-font-heading)" }}>
              Envie uma mensagem
            </p>
            <p className="mt-1 text-[12px] text-[var(--site-muted)]">
              Preencha os dados abaixo e a loja retorna pelo canal informado.
            </p>
            <div className="mt-5">{contactForm}</div>
          </div>
        </div>
      </section>

      <section className={`${SHELL} py-12`}>
        <SectionHeading
          title="Visite nossa loja"
          description="Confira endereço, horários e canais de atendimento antes de vir até aqui."
        />

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
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

          <div className="flex flex-col rounded-[var(--site-radius)] border border-[var(--site-border)] p-6">
            <p className="text-[16px] font-semibold" style={{ fontFamily: "var(--site-font-heading)" }}>
              {site.name}
            </p>
            {site.contact.address.full ? (
              <p className="mt-3 text-[12px] leading-relaxed text-[var(--site-muted)]">
                {site.contact.address.full}
              </p>
            ) : null}

            {hours.length > 0 ? (
              <>
                <p className="mt-5 text-[13px] font-medium">Horário de atendimento</p>
                <ul className="mt-2 space-y-1 text-[12px] text-[var(--site-muted)]">
                  {hours.map((line) => (
                    <li key={line.label}>
                      {line.label}: {line.value}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}

            {whatsapp ? (
              <a
                href={whatsapp}
                target="_blank"
                rel="noreferrer"
                className="mt-auto inline-flex items-center justify-center gap-2 rounded-[var(--site-radius)] bg-[var(--site-primary)] px-5 py-3 pt-3 text-[13px] font-medium text-[var(--site-primary-foreground)] transition-colors hover:bg-[var(--site-primary-hover)]"
              >
                <WhatsappIcon />
                Falar no WhatsApp
              </a>
            ) : null}
          </div>
        </div>
      </section>

      <section className="bg-[var(--site-background)] py-12">
        <div className={SHELL}>
          <SectionHeading title="Como podemos ajudar?" />
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
                className="flex flex-col rounded-[var(--site-radius)] border border-[var(--site-border)] bg-[var(--site-surface)] p-6"
              >
                <p className="text-[14px] font-medium">{item.title}</p>
                <p className="mt-2 text-[12px] leading-relaxed text-[var(--site-muted)]">
                  {item.text}
                </p>
                <Link
                  href={item.href}
                  className="mt-auto pt-5 text-[13px] font-medium text-[var(--site-primary)] hover:underline"
                >
                  {item.cta} →
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <HelpBand
        site={site}
        links={links}
        title="Precisa de uma resposta rápida?"
        description="Fale direto com a equipe pelo WhatsApp durante o horário de atendimento."
      />
    </Shell>
  );
}
