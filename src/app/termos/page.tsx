import type { Metadata } from "next";
import { Logo } from "@/components/layout/logo";
import { APP_NAME } from "@/lib/brand";
import { PROMO_FIRST_PAYMENT_CENTS } from "@/lib/gateway/references";
import { formatCurrency } from "@/lib/utils";
import { TERMS_VERSION } from "@/lib/validation/checkout";

export const metadata: Metadata = { title: "Termos de Uso" };

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: "1. Quem somos e o que é este documento",
    body: [
      `Estes Termos de Uso regulam a contratação e o uso do ${APP_NAME}, plataforma de gestão para revendas de veículos mantida pela C4MP — CAMP 4 DIGITAL LTDA, CNPJ 48.924.180/0001-24, com sede em Belo Horizonte/MG ("nós"). Quem contrata em nome de uma revenda ("você" ou "Contratante") declara ter poderes para isso.`,
      "Ao marcar a opção de aceite na contratação, você concorda com estes Termos. Se não concordar, não contrate.",
    ],
  },
  {
    title: "2. O serviço",
    body: [
      `O ${APP_NAME} oferece, conforme o plano contratado, painel de estoque, site da revenda, integração com portais de anúncio, gestão de leads e outras funcionalidades descritas na página de planos. O conjunto exato de recursos e limites é o do plano vigente na sua conta.`,
      "Integrações com terceiros (portais de anúncio, WhatsApp, meios de pagamento, provedores de domínio) dependem desses terceiros. Mudanças, indisponibilidades ou recusas deles podem afetar o funcionamento da integração sem que isso caracterize falha nossa.",
    ],
  },
  {
    title: "3. Cadastro e acesso",
    body: [
      "Você deve informar dados verdadeiros e mantê-los atualizados, inclusive CNPJ ou CPF e contatos de cobrança.",
      "O e-mail e a senha de acesso são pessoais. Você responde pelo que for feito com eles e pelos usuários que cadastrar na sua conta. Avise-nos se suspeitar de uso indevido.",
    ],
  },
  {
    title: "4. Planos, preço e cobrança",
    body: [
      `Na contratação online, o primeiro mês custa ${formatCurrency(PROMO_FIRST_PAYMENT_CENTS)}, cobrados na hora no cartão de crédito. A partir do mesmo dia do mês seguinte, o valor do plano escolhido é cobrado automaticamente todo mês, no mesmo cartão, até o cancelamento.`,
      "Os pagamentos são processados pelo Asaas. Os dados do cartão são enviados diretamente a ele e não ficam guardados no nosso sistema.",
      "Os preços podem ser reajustados com aviso prévio de pelo menos 30 dias. Pagamento em atraso pode ter multa e juros, conforme informado na cobrança.",
    ],
  },
  {
    title: "5. Inadimplência e suspensão",
    body: [
      "Se uma mensalidade não for paga, depois do prazo de tolerância o acesso ao painel pode ser limitado a consulta ou suspenso, e o site da revenda pode sair do ar, até a regularização. Quitada a pendência, o acesso volta.",
    ],
  },
  {
    title: "6. Cancelamento",
    body: [
      "Você pode cancelar quando quiser, sem multa e sem fidelidade, pelos canais de atendimento. O cancelamento interrompe as cobranças futuras; o período já pago não é reembolsado proporcionalmente, salvo quando a lei exigir.",
      "Podemos encerrar a conta em caso de violação destes Termos, uso ilícito ou fraude, com aviso sempre que possível.",
    ],
  },
  {
    title: "7. Suas responsabilidades",
    body: [
      "Você é responsável pelo conteúdo que publica (veículos, fotos, preços, textos, dados de contato) e por ter os direitos de uso sobre ele, e também pela veracidade das ofertas e pelo cumprimento do Código de Defesa do Consumidor e das regras dos portais onde anuncia.",
      "É proibido usar a plataforma para atividades ilegais, enviar mensagens não solicitadas em massa, tentar acessar dados de outras revendas ou interferir no funcionamento do sistema.",
    ],
  },
  {
    title: "8. Dados pessoais (LGPD)",
    body: [
      "Os dados de clientes e interessados que chegam pela sua revenda (leads, propostas, avaliações) são seus: você é o controlador desses dados, e nós os tratamos como operador, apenas para prestar o serviço, conforme a Lei 13.709/2018.",
      "Você deve ter base legal para tratar esses dados e atender os pedidos dos titulares. Nós mantemos medidas de segurança adequadas e não vendemos nem compartilhamos esses dados para outras finalidades.",
      "Os dados da sua conta (nome, e-mail, telefone, documento) são usados para acesso, cobrança, suporte e comunicações sobre o serviço.",
    ],
  },
  {
    title: "9. Disponibilidade",
    body: [
      "Trabalhamos para manter a plataforma disponível continuamente, mas pode haver interrupções para manutenção, atualização ou por falhas de infraestrutura e de terceiros. Manutenções programadas serão avisadas sempre que possível.",
    ],
  },
  {
    title: "10. Limitação de responsabilidade",
    body: [
      "Não respondemos por lucros cessantes, vendas não realizadas ou danos indiretos, nem por conteúdo publicado por você. Na máxima extensão permitida pela lei, nossa responsabilidade total fica limitada ao valor pago por você nos 12 meses anteriores ao fato.",
    ],
  },
  {
    title: "11. Propriedade intelectual",
    body: [
      `O software, a marca ${APP_NAME} e os modelos de site são nossos. A contratação dá a você o direito de uso enquanto a assinatura estiver ativa, sem transferência de propriedade. O conteúdo que você cadastra continua sendo seu.`,
    ],
  },
  {
    title: "12. Alterações destes Termos",
    body: [
      "Podemos atualizar estes Termos. Mudanças relevantes serão comunicadas com antecedência pelo painel ou por e-mail. Continuar usando o serviço depois da vigência significa concordar com a nova versão.",
    ],
  },
  {
    title: "13. Lei e foro",
    body: [
      "Estes Termos seguem a lei brasileira. Fica eleito o foro da comarca de Belo Horizonte/MG para resolver eventuais conflitos, salvo disposição legal em contrário.",
    ],
  },
];

export default function TermsPage() {
  const [year, month, day] = TERMS_VERSION.split("-");

  return (
    <main className="min-h-screen bg-bg">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-16 max-w-3xl items-center px-4 sm:px-6">
          <a href="/planos" aria-label="Voltar aos planos">
            <Logo className="h-6" />
          </a>
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:py-14">
        <p className="label-instrument text-accent-text">Documento legal</p>
        <h1 className="mt-2 font-display text-[28px] font-semibold leading-tight tracking-tight text-text">
          Termos de Uso
        </h1>
        <p className="mt-2 text-[13px] text-muted">
          Versão de {day}/{month}/{year}
        </p>

        <div className="mt-10 space-y-8">
          {SECTIONS.map((section) => (
            <section key={section.title}>
              <h2 className="font-display text-base font-semibold text-text">{section.title}</h2>
              <div className="mt-2 space-y-3 text-sm leading-relaxed text-muted">
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </article>
    </main>
  );
}
