import Form from "next/form";
import Link from "next/link";
import { Search } from "lucide-react";
import type { HomeProps } from "../contract";
import {
  CategoryChips,
  SHELL,
  SectionHeading,
  Shell,
  WhatsappBand,
  WhatsappButton,
  categoryShortcuts,
} from "./chrome";
import { VehicleGrid } from "./vehicle-card";

export function Home({
  site,
  links,
  featured,
  latest,
  facets,
  totalVehicles,
  financingForm,
}: HomeProps) {
  const destaques = featured.length > 0 ? featured : latest;
  const atalhos = categoryShortcuts(facets, links);

  return (
    <Shell site={site} links={links} active="home">
      {/* ------------------------------------------------------------ hero */}
      <section className="border-b border-[var(--site-border)] bg-[var(--site-background)]">
        <div className={`${SHELL} py-14 lg:py-20`}>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--site-primary)]">
            Estoque atualizado todos os dias
          </p>
          <h1
            className="max-w-2xl text-[38px] font-bold leading-[1.1] text-[var(--site-text)] sm:text-[46px]"
            style={{ fontFamily: "var(--site-font-heading)" }}
          >
            Seu próximo carro está aqui.
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-[var(--site-muted)]">
            Encontre veículos selecionados, compare opções e fale direto com a equipe da loja.
          </p>

          {/*
            A busca é um GET para a página de estoque.
            Formulário de verdade em vez de estado: o template é servidor, e o
            resultado precisa ser um endereço que a pessoa consiga compartilhar.
          */}
          <Form action={links.stock} className="mt-8 flex max-w-2xl gap-2">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--site-muted)]"
                aria-hidden="true"
              />
              <input
                type="search"
                name="q"
                placeholder="Busque por marca, modelo ou versão"
                aria-label="Buscar no estoque"
                className="h-12 w-full rounded-[var(--site-radius)] border border-[var(--site-border)] bg-[var(--site-surface)] pl-11 pr-4 text-sm text-[var(--site-text)] outline-none placeholder:text-[var(--site-muted)] focus:border-[var(--site-primary)]"
              />
            </div>
            <button
              type="submit"
              className="shrink-0 rounded-[var(--site-radius)] bg-[var(--site-primary)] px-6 text-sm font-medium text-[var(--site-primary-foreground)] transition-colors hover:bg-[var(--site-primary-hover)]"
            >
              Buscar
            </button>
          </Form>

          <CategoryChips items={atalhos} />
        </div>
      </section>

      {/* ------------------------------------------------------ categorias */}
      {atalhos.length > 0 ? (
        <section className={`${SHELL} py-16`}>
          <SectionHeading
            title="Encontre do seu jeito"
            description="Explore o estoque por categoria ou faixa de interesse."
            action={
              <Link
                href={links.stock}
                className="text-sm font-medium text-[var(--site-primary)] hover:underline"
              >
                Ver todo o estoque →
              </Link>
            }
          />

          {/*
            Seis colunas no desktop, como o desenho. A lista sai das facetas do
            estoque real: oferecer "Picapes" a uma loja que só vende hatch leva
            a pessoa a uma busca vazia já no primeiro clique.
          */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {atalhos.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="rounded-[var(--site-radius)] border border-[var(--site-border)] bg-[var(--site-surface)] p-4 transition-colors hover:border-[var(--site-primary)]"
              >
                <span className="inline-flex h-8 items-center rounded-full bg-[var(--site-primary)]/10 px-2.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--site-primary)]">
                  {item.label.slice(0, 3)}
                </span>
                <p
                  className="mt-3 text-sm font-semibold text-[var(--site-text)]"
                  style={{ fontFamily: "var(--site-font-heading)" }}
                >
                  {item.label}
                </p>
                <p className="mt-1 text-[12px] leading-snug text-[var(--site-muted)]">
                  {item.description}
                </p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* ------------------------------------------------------- destaques */}
      {destaques.length > 0 ? (
        <section className={`${SHELL} py-16`}>
          <SectionHeading
            title="Ofertas em destaque"
            description={`Veículos selecionados do nosso estoque atual.${
              totalVehicles > 0 ? ` ${totalVehicles} disponíveis.` : ""
            }`}
            action={
              <Link
                href={links.stock}
                className="text-sm font-medium text-[var(--site-primary)] hover:underline"
              >
                Ver estoque completo →
              </Link>
            }
          />
          {/* quatro em uma linha, como o desenho: o resto vive no estoque */}
          <VehicleGrid
            vehicles={destaques.slice(0, 4)}
            links={links}
            storeName={site.name}
            columns={4}
          />
        </section>
      ) : (
        <section className={`${SHELL} py-20 text-center`}>
          <h2
            className="text-2xl font-bold text-[var(--site-text)]"
            style={{ fontFamily: "var(--site-font-heading)" }}
          >
            Estoque em atualização
          </h2>
          <p className="mx-auto mt-2 max-w-md text-[15px] text-[var(--site-muted)]">
            Estamos preparando os próximos veículos. Fale com a equipe para saber o que já está
            disponível.
          </p>
          <div className="mt-6 flex justify-center">
            <WhatsappButton
              href={links.whatsapp(`Olá! Quero saber quais carros a ${site.name} tem disponíveis.`)}
            />
          </div>
        </section>
      )}

      {/* ------------------------------------------------------- conversão */}
      <WhatsappBand
        site={site}
        links={links}
        title="Ainda não encontrou o carro ideal?"
        description="Conte o que você procura e nossa equipe ajuda a encontrar uma opção no estoque."
      />

      {/* --------------------------------------------------- como funciona */}
      <section className={`${SHELL} py-16`}>
        <SectionHeading
          title="Comprar seu próximo carro pode ser simples"
          description="Mais clareza, segurança e atendimento direto em todas as etapas."
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              title: "Compra segura",
              text: "Veículos selecionados e informações claras sobre o estoque.",
            },
            {
              title: "Financiamento",
              text: "Simule condições de pagamento com diferentes perfis de entrada.",
            },
            {
              title: "Seu usado na troca",
              text: "Use seu veículo atual como parte do pagamento da próxima compra.",
            },
            {
              title: "Atendimento direto",
              text: "Fale com a equipe da própria loja por telefone ou WhatsApp.",
            },
          ].map((item, index) => (
            <div
              key={item.title}
              className="rounded-[var(--site-radius)] border border-[var(--site-border)] bg-[var(--site-surface)] p-5"
            >
              <span className="inline-flex h-7 items-center rounded-full bg-[var(--site-background)] px-2.5 text-xs font-semibold text-[var(--site-primary)]">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3
                className="mt-3 text-base font-semibold text-[var(--site-text)]"
                style={{ fontFamily: "var(--site-font-heading)" }}
              >
                {item.title}
              </h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--site-muted)]">
                {item.text}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* --------------------------------------------------- financiamento */}
      <section className="border-y border-[var(--site-border)] bg-[var(--site-background)] py-16">
        <div className={`${SHELL} grid grid-cols-1 items-center gap-10 lg:grid-cols-2`}>
          <div>
            <h2
              className="text-[30px] font-bold leading-tight text-[var(--site-text)]"
              style={{ fontFamily: "var(--site-font-heading)" }}
            >
              Financiamento do seu jeito
            </h2>
            <p className="mt-3 max-w-md text-[15px] leading-relaxed text-[var(--site-muted)]">
              Escolha seu veículo, informe uma entrada e converse com a equipe sobre as melhores
              condições para o seu perfil.
            </p>
            <ul className="mt-5 space-y-2 text-sm text-[var(--site-text)]">
              {[
                "Simulação sem compromisso",
                "Entrada flexível",
                "Atendimento humano para fechar a proposta",
              ].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--site-success)]" />
                  {item}
                </li>
              ))}
            </ul>
            <Link
              href={links.financing}
              className="mt-6 inline-flex items-center justify-center rounded-lg bg-[var(--site-primary)] px-5 py-2.5 text-sm font-medium text-[var(--site-primary-foreground)] transition-colors hover:bg-[var(--site-primary-hover)]"
            >
              Simular financiamento
            </Link>
          </div>

          <div className="rounded-[var(--site-radius)] border border-[var(--site-border)] bg-[var(--site-surface)] p-6">
            <p
              className="text-lg font-semibold text-[var(--site-text)]"
              style={{ fontFamily: "var(--site-font-heading)" }}
            >
              Faça uma simulação rápida
            </p>
            <p className="mt-1 text-[13px] text-[var(--site-muted)]">
              Escolha o veículo e a entrada. Você continua na próxima tela.
            </p>

            {/*
              Sem estoque com preço não há o que simular, e um formulário vazio
              na home só ocupa espaço prometendo uma conta impossível.
            */}
            {financingForm ? (
              <div className="mt-5">{financingForm}</div>
            ) : (
              <ol className="mt-4 space-y-3 text-sm text-[var(--site-muted)]">
                <li>1. Escolha o veículo no estoque.</li>
                <li>2. Informe quanto pretende dar de entrada.</li>
                <li>3. Envie seus dados e a loja retorna com as condições.</li>
              </ol>
            )}

            <p className="mt-5 border-t border-[var(--site-border)] pt-4 text-xs text-[var(--site-muted)]">
              O valor da parcela depende da análise de crédito e é informado pela loja.
            </p>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------- a loja */}
      <section className={`${SHELL} py-16`}>
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2">
          {/* contorno: sem ele o espaco reservado some no fundo da secao e a
              coluna parece um vao, nao uma foto que falta */}
          <div className="aspect-4/3 overflow-hidden rounded-[var(--site-radius)] border border-[var(--site-border)] bg-[var(--site-surface)]">
            {site.banners[0]?.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={site.banners[0].imageUrl}
                alt={site.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-[var(--site-muted)]">
                Foto da loja
              </div>
            )}
          </div>

          <div>
            <h2
              className="text-[30px] font-bold leading-tight text-[var(--site-text)]"
              style={{ fontFamily: "var(--site-font-heading)" }}
            >
              {site.aboutTitle ?? "Uma loja para comprar com tranquilidade"}
            </h2>
            {site.aboutText ? (
              <p className="mt-3 text-[15px] leading-relaxed text-[var(--site-muted)]">
                {site.aboutText}
              </p>
            ) : null}

            {site.stats.length > 0 ? (
              <div className="mt-6 flex flex-wrap gap-8">
                {site.stats.map((stat) => (
                  <div key={stat.label}>
                    <p
                      className="text-[26px] font-bold leading-none text-[var(--site-primary)]"
                      style={{ fontFamily: "var(--site-font-heading)" }}
                    >
                      {stat.value}
                    </p>
                    <p className="mt-1 text-xs text-[var(--site-muted)]">{stat.label}</p>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="mt-7 flex flex-wrap gap-3">
              <WhatsappButton
                href={links.whatsapp(`Olá! Vim pelo site da ${site.name}.`)}
              />
              <Link
                href={links.about}
                className="inline-flex items-center justify-center rounded-full border border-[var(--site-border)] px-5 py-2.5 text-sm font-medium text-[var(--site-text)] transition-colors hover:border-[var(--site-primary)] hover:text-[var(--site-primary)]"
              >
                Conhecer a loja
              </Link>
            </div>
          </div>
        </div>
      </section>
    </Shell>
  );
}
