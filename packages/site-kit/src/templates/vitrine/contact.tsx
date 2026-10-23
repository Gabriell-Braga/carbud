import Link from "next/link";
import { MapPin } from "lucide-react";
import type { ContactProps } from "../contract";
import { summarizeHours } from "../shared/hours";
import { mapsEmbedUrl } from "../../lib/maps";
import { StoreCards } from "../shared/store-cards";
import { SHELL, SectionHeading, Shell, WhatsappBand } from "./chrome";

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
          text: "Fale diretamente com a equipe durante o horário de atendimento.",
          value: site.contact.phone,
          href: `tel:${site.contact.phone.replace(/\D/g, "")}`,
          external: false,
        }
      : null,
    site.contact.email
      ? {
          title: "E-mail",
          text: "Para mensagens, documentos ou solicitações que não precisam de resposta imediata.",
          value: site.contact.email,
          href: `mailto:${site.contact.email}`,
          external: false,
        }
      : null,
  ].filter((canal): canal is NonNullable<typeof canal> => canal !== null);

  return (
    <Shell site={site} links={links} active="contact">
      {/* ----------------------------------------------------------- herói */}
      <section className="border-b border-[var(--site-border)] bg-[var(--site-background)]">
        <div className={`${SHELL} grid grid-cols-1 items-start gap-10 py-14 lg:grid-cols-[minmax(0,1fr)_480px]`}>
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--site-primary)]">
              Contato
            </p>
            <h1
              className="text-[34px] font-bold leading-tight text-[var(--site-text)] sm:text-[40px]"
              style={{ fontFamily: "var(--site-font-heading)" }}
            >
              Fale com a nossa equipe
            </h1>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-[var(--site-muted)]">
              Escolha o canal que fizer mais sentido. Nossa equipe pode ajudar com veículos,
              financiamento, avaliação do seu carro e informações sobre a loja.
            </p>

            {/* cada canal é um card clicável inteiro: o alvo é o canal, não o texto */}
            <div className="mt-6 grid gap-3">
              {canais.map((canal) => (
                <a
                  key={canal.title}
                  href={canal.href}
                  {...(canal.external ? { target: "_blank", rel: "noreferrer" } : {})}
                  className="rounded-[var(--site-radius)] border border-[var(--site-border)] bg-[var(--site-surface)] px-5 py-4 transition-colors hover:border-[var(--site-primary)]"
                >
                  <p
                    className="text-base font-semibold text-[var(--site-text)]"
                    style={{ fontFamily: "var(--site-font-heading)" }}
                  >
                    {canal.title}
                  </p>
                  <p className="mt-1 text-[13px] leading-relaxed text-[var(--site-muted)]">
                    {canal.text}
                  </p>
                  <p className="mt-2 text-sm font-medium text-[var(--site-primary)]">
                    {canal.value}
                  </p>
                </a>
              ))}
            </div>
          </div>

          <div className="rounded-[var(--site-radius)] border border-[var(--site-border)] bg-[var(--site-surface)] p-6">
            <p
              className="text-lg font-semibold text-[var(--site-text)]"
              style={{ fontFamily: "var(--site-font-heading)" }}
            >
              Envie uma mensagem
            </p>
            <p className="mt-1 text-[13px] text-[var(--site-muted)]">
              Preencha os dados abaixo e a loja retorna pelo canal informado.
            </p>
            <div className="mt-5">{contactForm}</div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------- visite nossa loja */}
      <section className={`${SHELL} py-14`}>
        <SectionHeading
          title="Visite nossa loja"
          description="Confira endereço, horários e canais de atendimento antes de vir até a loja."
        />

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="aspect-16/9 overflow-hidden rounded-[var(--site-radius)] border border-[var(--site-border)] bg-[var(--site-background)]">
            {/*
              O mapa de verdade, e não um link para ele.
              Quem abre esta seção quer saber ONDE fica; sair do site para
              descobrir isso é pedir uma decisão antes de dar a informação.
              `lazy` porque ele fica abaixo da dobra na maioria das telas.
            */}
            {mapa ? (
              <iframe
                src={mapa}
                title={`Localização da ${site.name}`}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="h-full w-full border-0"
              />
            ) : site.contact.mapsUrl ? (
              <a
                href={site.contact.mapsUrl}
                target="_blank"
                rel="noreferrer"
                className="flex h-full flex-col items-center justify-center gap-2 text-sm text-[var(--site-primary)]"
              >
                <MapPin className="h-6 w-6" aria-hidden="true" />
                Ver localização no mapa
              </a>
            ) : (
              /* sem endereço cadastrado não há mapa nem link honesto a mostrar */
              <div className="flex h-full flex-col items-center justify-center gap-1 text-sm text-[var(--site-muted)]">
                <span>Endereço não informado</span>
              </div>
            )}
          </div>

          <div className="rounded-[var(--site-radius)] bg-[var(--site-text)] p-6 text-white">
            <p
              className="text-lg font-bold uppercase tracking-tight"
              style={{ fontFamily: "var(--site-font-heading)" }}
            >
              {site.name}
            </p>

            {site.contact.address.full ? (
              <p className="mt-3 text-[13px] leading-relaxed text-white/70">
                {site.contact.address.full}
              </p>
            ) : null}

            {hours.length > 0 ? (
              <>
                <p className="mt-5 text-sm font-semibold">Horário de atendimento</p>
                <ul className="mt-2 space-y-1 text-[13px] text-white/70">
                  {hours.map((line) => (
                    <li key={line.label}>
                      {line.label}: {line.value}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}

            {site.contact.phone ? (
              <p className="mt-5 text-[13px] text-white/70">{site.contact.phone}</p>
            ) : null}
            {site.contact.email ? (
              <p className="text-[13px] text-white/70">{site.contact.email}</p>
            ) : null}

            {site.contact.mapsUrl ? (
              <a
                href={site.contact.mapsUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-5 inline-flex w-full items-center justify-center rounded-[var(--site-radius)] bg-[var(--site-primary)] px-5 py-2.5 text-sm font-medium text-[var(--site-primary-foreground)] transition-colors hover:bg-[var(--site-primary-hover)]"
              >
                Abrir no mapa
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

      {/* ---------------------------------------------- como podemos ajudar */}
      <section className="border-y border-[var(--site-border)] bg-[var(--site-background)] py-14">
        <div className={SHELL}>
          <SectionHeading
            title="Como podemos ajudar?"
            description="Acesse diretamente a área mais relacionada ao que você precisa."
          />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {[
              {
                title: "Quero comprar um carro",
                text: "Veja todos os veículos disponíveis e filtre por marca, modelo e perfil.",
                href: links.stock,
                cta: "Ver estoque",
              },
              {
                title: "Quero financiar",
                text: "Simule entrada e prazo e envie seus dados para a loja continuar o atendimento.",
                href: links.financing,
                cta: "Simular financiamento",
              },
              {
                title: "Quero vender meu carro",
                text: "Informe os dados do seu veículo para iniciar uma avaliação com a loja.",
                href: links.sellCar,
                cta: "Avaliar meu carro",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="flex flex-col rounded-[var(--site-radius)] border border-[var(--site-border)] bg-[var(--site-surface)] p-6"
              >
                <h3
                  className="text-base font-semibold text-[var(--site-text)]"
                  style={{ fontFamily: "var(--site-font-heading)" }}
                >
                  {item.title}
                </h3>
                <p className="mt-2 text-[13px] leading-relaxed text-[var(--site-muted)]">
                  {item.text}
                </p>
                <Link
                  href={item.href}
                  className="mt-auto pt-5 text-sm font-medium text-[var(--site-primary)] hover:underline"
                >
                  {item.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* a faixa clara fecha a página sem competir com o rodapé escuro */}
      <WhatsappBand
        site={site}
        links={links}
        tone="light"
        title="Precisa de uma resposta rápida?"
        description="Fale direto com a equipe pelo WhatsApp durante o horário de atendimento."
      />
    </Shell>
  );
}
