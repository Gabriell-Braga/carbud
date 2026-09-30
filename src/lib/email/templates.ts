import { APP_NAME } from "@/lib/brand";

/**
 * Os textos e o desenho do que sai por e-mail.
 *
 * Todos moram aqui, e não junto de quem dispara: quem mexe em texto não
 * precisa abrir rota de API, e a moldura fica igual em todos sem cada um
 * recopiar HTML.
 *
 * **Por que o HTML é tão antiquado.** Cliente de e-mail não é navegador. O
 * Gmail remove `<style>`, o Outlook desktop renderiza com o motor do Word
 * (sem flex, sem grid, sem `max-width` confiável) e vários ignoram imagem de
 * fundo. Então: tabela para tudo que é layout, estilo na tag, largura em
 * atributo, cor em `bgcolor`. É feio de ler e é o que chega inteiro.
 *
 * Cada e-mail leva também a versão em texto puro. Não é capricho: provedor
 * corporativo bloqueia HTML com frequência, e mensagem que chega em branco é
 * pior do que não chegar.
 *
 * Os textos de cada e-mail têm um padrão aqui e podem ser reescritos no Painel
 * Geral (Configurações → E-mail). O que fica gravado é só a diferença; quem
 * dispara busca com `getEmailCopy` e passa como segundo argumento.
 */

export type EmailContent = {
  subject: string;
  html: string;
  text: string;
  /** O mesmo trecho escondido no HTML, à parte para a prévia do editor. */
  preheader: string;
};

/* Paleta da marca — as mesmas do painel. */
const ROXO = "#694ae5";
const ROXO_MEIO = "#7b5cf0";
const LAVANDA = "#9191e2";
const TINTA = "#11111c";
const CINZA = "#6b6f76";
const FUNDO = "#f4f4f7";
const BORDA = "#e8e8ee";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * A faixa colorida das bordas de cima e de baixo.
 *
 * Três células de cor sólida em vez de um gradiente CSS: gradiente não
 * renderiza no Outlook, e a faixa — que é a assinatura visual da mensagem —
 * sumiria justamente onde mais gente lê e-mail de trabalho.
 */
function faixa(): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
        <tr>
          <td width="34%" bgcolor="${ROXO}" style="height:6px;line-height:6px;font-size:0">&nbsp;</td>
          <td width="33%" bgcolor="${ROXO_MEIO}" style="height:6px;line-height:6px;font-size:0">&nbsp;</td>
          <td width="33%" bgcolor="${LAVANDA}" style="height:6px;line-height:6px;font-size:0">&nbsp;</td>
        </tr>
      </table>`;
}

/**
 * Moldura de todos os e-mails: cartão centrado, faixa em cima e embaixo.
 *
 * `preheader` é o trecho que o Gmail mostra ao lado do assunto, na lista. Sem
 * ele, o cliente pega a primeira coisa que encontra no HTML — e a caixa de
 * entrada fica com "CARBUD CARBUD CARBUD" em todas as linhas.
 */
function layout(input: {
  preheader: string;
  eyebrow: string;
  title: string;
  body: string;
  footer?: string;
}): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <!-- sem isto o cliente de e-mail do celular renderiza a 980px e encolhe tudo -->
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light only">
  <title>${escapeHtml(input.title)}</title>
</head>
<body style="margin:0;padding:0;background:${FUNDO}">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(input.preheader)}</div>
  <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" bgcolor="${FUNDO}" style="background:${FUNDO};padding:0;margin:0">
    <tr>
      <td align="center" style="padding:28px 12px">
        <table width="600" cellpadding="0" cellspacing="0" border="0" role="presentation" style="width:100%;max-width:600px;background:#ffffff;border:1px solid ${BORDA};border-radius:14px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">
          <tr><td>${faixa()}</td></tr>
          <tr>
            <td align="center" style="padding:30px 34px 34px 34px">
              <p style="margin:0 0 6px 0;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:${CINZA}">${escapeHtml(input.eyebrow)}</p>
              <h1 style="margin:0 0 18px 0;font-size:22px;line-height:1.3;color:${TINTA};font-weight:700">${escapeHtml(input.title)}</h1>
              ${input.body}
            </td>
          </tr>
          ${
            input.footer
              ? `<tr>
            <td align="center" style="padding:0 34px 26px 34px">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
                <tr><td style="border-top:1px solid ${BORDA};height:1px;line-height:1px;font-size:0">&nbsp;</td></tr>
              </table>
              <p style="margin:16px 0 0 0;font-size:12px;line-height:1.5;color:${CINZA}">${input.footer}</p>
            </td>
          </tr>`
              : ""
          }
          <tr><td>${faixa()}</td></tr>
        </table>
        <p style="margin:14px 0 0 0;font-size:11px;color:${CINZA};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">${escapeHtml(APP_NAME)} · mensagem automática</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Parágrafo centrado do corpo. */
function paragrafo(texto: string, cor = TINTA): string {
  return `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:${cor}">${texto}</p>`;
}

/**
 * Botão em tabela, e não só um `<a>` com padding.
 *
 * No Outlook o padding de um link não vira área clicável: o botão aparece
 * como texto sublinhado. A célula com `bgcolor` é o que dá o retângulo
 * clicável em todo cliente.
 */
function botao(href: string, label: string): string {
  return `<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin:22px auto 6px auto">
                <tr>
                  <td align="center" bgcolor="${ROXO}" style="border-radius:999px">
                    <a href="${escapeHtml(href)}" style="display:inline-block;padding:14px 30px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px">${escapeHtml(label)}</a>
                  </td>
                </tr>
              </table>`;
}

/** Bloco de dados: rótulo em cima, valor embaixo, tudo centrado. */
function dados(itens: { rotulo: string; valor: string }[]): string {
  if (itens.length === 0) return "";

  const linhas = itens
    .map(
      (item) => `<tr>
                    <td align="center" style="padding:9px 10px;border-top:1px solid ${BORDA}">
                      <span style="display:block;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${CINZA};margin-bottom:3px">${escapeHtml(item.rotulo)}</span>
                      <span style="display:block;font-size:15px;color:${TINTA};font-weight:600">${item.valor}</span>
                    </td>
                  </tr>`,
    )
    .join("");

  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin:4px 0 6px 0;border:1px solid ${BORDA};border-radius:12px;background:#fbfbfd">
                <tr><td style="height:4px;line-height:4px;font-size:0">&nbsp;</td></tr>
                ${linhas.replace(`border-top:1px solid ${BORDA}`, "border-top:0")}
                <tr><td style="height:4px;line-height:4px;font-size:0">&nbsp;</td></tr>
              </table>`;
}

/** A mensagem que a pessoa escreveu, destacada do resto. */
function citacao(texto: string): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin:16px 0">
                <tr>
                  <td style="border-left:3px solid ${LAVANDA};background:${FUNDO};border-radius:0 10px 10px 0;padding:14px 16px">
                    <p style="margin:0;font-size:15px;line-height:1.6;color:${TINTA};font-style:italic">“${escapeHtml(texto)}”</p>
                  </td>
                </tr>
              </table>`;
}

/* ------------------------------------------------------------------------ */
/* Textos editáveis                                                          */
/* ------------------------------------------------------------------------ */

/**
 * O que o Painel Geral pode reescrever em cada e-mail.
 *
 * Só texto, nunca HTML. A moldura acima é o que faz a mensagem chegar inteira
 * no Outlook e no Gmail; deixar editar o HTML seria deixar quebrar isso sem
 * perceber — o erro só aparece na caixa de entrada de quem recebe. Os dados
 * que mudam a cada envio (telefone, mensagem do cliente, link) também ficam
 * fora: entram sozinhos, no lugar certo, e escapados.
 */
export type EmailCopy = {
  subject: string;
  /** Trecho que o cliente de e-mail mostra ao lado do assunto, na lista. */
  preheader: string;
  title: string;
  /** Parágrafos separados por linha em branco; `**assim**` vira negrito. */
  body: string;
  button: string;
  footer: string;
};

export const EMAIL_COPY_FIELDS = [
  "subject",
  "preheader",
  "title",
  "body",
  "button",
  "footer",
] as const satisfies readonly (keyof EmailCopy)[];

export const EMAIL_TEMPLATE_KEYS = ["newLead", "leadAssigned", "welcome", "passwordReset"] as const;
export type EmailTemplateKey = (typeof EMAIL_TEMPLATE_KEYS)[number];

/** O que está gravado: só os campos que diferem do padrão. */
export type EmailCopyOverrides = Partial<Record<EmailTemplateKey, Partial<EmailCopy>>>;

export type EmailVariable = { key: string; label: string };

export type EmailTemplateInfo = {
  name: string;
  group: "Comercial" | "Acesso";
  /** Quando sai — para quem edita saber o que está mexendo. */
  when: string;
  /** O que entra sozinho e não aparece nos campos. */
  automatic: string;
  variables: EmailVariable[];
  defaults: EmailCopy;
};

const LEAD_VARIABLES: EmailVariable[] = [
  { key: "nome", label: "Nome do cliente" },
  { key: "veiculo", label: "Veículo de interesse" },
  { key: "origem", label: "Origem do contato" },
  { key: "revenda", label: "Nome da revenda" },
  { key: "responsavel", label: "Vendedor responsável" },
];

export const EMAIL_TEMPLATES: Record<EmailTemplateKey, EmailTemplateInfo> = {
  newLead: {
    name: "Lead novo",
    group: "Comercial",
    when: "Quando um lead chega pelo site ou por um portal, para a equipe da revenda.",
    automatic:
      "Veículo, telefone, e-mail e responsável em um quadro; a mensagem do cliente em destaque; o atalho para o WhatsApp. Quando o cliente deixa mensagem, o começo dela substitui a prévia.",
    variables: LEAD_VARIABLES,
    defaults: {
      subject: "Lead novo: {{nome}} — {{veiculo}}",
      preheader: "Contato novo pelo {{origem}}. Responda rápido.",
      title: "{{nome}} entrou em contato",
      body: "Chegou agora pelo **{{origem}}**.",
      button: "Abrir no painel",
      footer: "Você recebe este aviso porque atende os leads desta revenda.",
    },
  },
  leadAssigned: {
    name: "Lead atribuído",
    group: "Comercial",
    when: "Quando um lead passa a ser de um vendedor, só para ele.",
    automatic:
      "Os mesmos dados do lead novo: quadro com veículo e contato, mensagem do cliente e atalho para o WhatsApp.",
    variables: LEAD_VARIABLES,
    defaults: {
      subject: "Lead para você: {{nome}} — {{veiculo}}",
      preheader: "Um lead novo é seu. Responda rápido.",
      title: "{{nome}} é seu",
      body: "Chegou agora pelo **{{origem}}**.",
      button: "Abrir no painel",
      footer: "Este lead foi atribuído a você. Ele também aparece no seu funil.",
    },
  },
  welcome: {
    name: "Convite de usuário",
    group: "Acesso",
    when: "Quando alguém é cadastrado no painel — pela revenda ou pelo Painel Geral.",
    automatic: "O link para a pessoa definir a própria senha. A senha nunca vai no e-mail.",
    variables: [
      { key: "nome", label: "Primeiro nome" },
      { key: "onde", label: "“no painel da Revenda X”" },
      { key: "revenda", label: "Nome da revenda" },
      { key: "convidado_por", label: "Quem cadastrou" },
      { key: "minutos", label: "Validade do link" },
    ],
    defaults: {
      subject: "Seu acesso {{onde}}",
      preheader: "Sua conta foi criada. Defina sua senha para entrar.",
      title: "Bem-vindo(a), {{nome}}",
      body: "Sua conta {{onde}} foi criada por {{convidado_por}}.\n\nEscolha sua senha e o acesso está pronto.",
      button: "Definir minha senha",
      footer:
        "O link vale por {{minutos}} minutos. Se ele vencer, use “Esqueci minha senha” na tela de acesso.",
    },
  },
  passwordReset: {
    name: "Redefinir senha",
    group: "Acesso",
    when: "Quando alguém pede “Esqueci minha senha” na tela de acesso.",
    automatic: "O link de redefinição, de uso único.",
    variables: [
      { key: "nome", label: "Primeiro nome" },
      { key: "minutos", label: "Validade do link" },
    ],
    defaults: {
      subject: "Redefinir sua senha",
      preheader: "Link para escolher uma nova senha. Vale por {{minutos}} minutos.",
      title: "Redefinir sua senha",
      body: "Olá, {{nome}}.\n\nRecebemos um pedido para redefinir a sua senha de acesso ao painel. Clique no botão para escolher uma nova.",
      button: "Escolher nova senha",
      footer:
        "O link vale por {{minutos}} minutos. Se não foi você, ignore esta mensagem: nada muda.",
    },
  },
};

/** Tamanho máximo de cada campo — assunto longo é cortado pelo celular. */
export const EMAIL_COPY_LIMITS: Record<keyof EmailCopy, number> = {
  subject: 150,
  preheader: 200,
  title: 150,
  body: 3000,
  button: 40,
  footer: 600,
};

/** Padrão por baixo, gravado por cima. Campo vazio volta para o padrão. */
export function resolveCopy(key: EmailTemplateKey, custom?: Partial<EmailCopy> | null): EmailCopy {
  const copy = { ...EMAIL_TEMPLATES[key].defaults };
  if (!custom) return copy;
  for (const field of EMAIL_COPY_FIELDS) {
    const value = custom[field];
    if (typeof value === "string" && value.trim()) copy[field] = value;
  }
  return copy;
}

const VARIABLE = /\{\{\s*([a-z_]+)\s*\}\}/g;

/** Variáveis escritas que o modelo não conhece — `{{nme}}` sairia literal. */
export function unknownVariables(key: EmailTemplateKey, text: string): string[] {
  const known = new Set(EMAIL_TEMPLATES[key].variables.map((variable) => variable.key));
  const unknown = new Set<string>();
  for (const match of text.matchAll(VARIABLE)) {
    if (!known.has(match[1])) unknown.add(match[1]);
  }
  return [...unknown];
}

type Vars = Record<string, string | null | undefined>;

function fill(text: string, vars: Vars): string {
  return text.replace(VARIABLE, (whole, name: string) =>
    name in vars ? (vars[name] ?? "") : whole,
  );
}

/**
 * Linha única preenchida, sem a sobra de variável vazia.
 *
 * "Lead novo: Ana — {{veiculo}}" sem veículo viraria "Lead novo: Ana — ", e o
 * traço solto no fim do assunto é a primeira coisa que se lê na notificação.
 */
function line(text: string, vars: Vars): string {
  return fill(text, vars)
    .replace(/\s+/g, " ")
    .replace(/\(\s*\)/g, "")
    .replace(/(\s*[—–\-·|:,])+\s*$/, "")
    .trim();
}

function paragraphsOf(text: string, vars: Vars): string[] {
  return fill(text, vars)
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

/** Escapa tudo e só depois devolve o negrito e as quebras de linha. */
function inlineHtml(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, `<strong style="color:${TINTA}">$1</strong>`)
    .replace(/\n/g, "<br>");
}

function stripMarks(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, "$1");
}

/** Versão em texto puro dos e-mails de acesso: título, corpo, link, rodapé. */
function plainText(
  title: string,
  paragraphs: string[],
  button: string,
  url: string,
  footer: string,
) {
  return [title, "", ...paragraphs.map(stripMarks), "", `${button}:`, url, "", footer].join("\n");
}

/** Com mais de um parágrafo, o primeiro fala com a pessoa e os outros explicam. */
function bodyHtml(paragraphs: string[]): string {
  return paragraphs
    .map((paragraph, index) =>
      paragrafo(inlineHtml(paragraph), paragraphs.length > 1 && index === 0 ? TINTA : CINZA),
    )
    .join("\n              ");
}

/* ------------------------------------------------------------------------ */
/* Acesso                                                                    */
/* ------------------------------------------------------------------------ */

export function passwordResetEmail(
  input: { name: string; url: string; minutes: number },
  custom?: Partial<EmailCopy> | null,
): EmailContent {
  const copy = resolveCopy("passwordReset", custom);
  const vars: Vars = { nome: input.name, minutos: String(input.minutes) };
  const paragraphs = paragraphsOf(copy.body, vars);
  const footer = line(copy.footer, vars);

  const preheader = line(copy.preheader, vars);

  return {
    subject: line(copy.subject, vars),
    preheader,
    text: plainText(line(copy.title, vars), paragraphs, line(copy.button, vars), input.url, footer),
    html: layout({
      preheader,
      eyebrow: APP_NAME,
      title: line(copy.title, vars),
      body: `${bodyHtml(paragraphs)}
              ${botao(input.url, line(copy.button, vars))}`,
      footer: escapeHtml(footer),
    }),
  };
}

/**
 * Boas-vindas de quem acabou de ser cadastrado.
 *
 * Leva um link para a pessoa definir a própria senha, em vez da senha
 * provisória escrita no corpo. Senha em e-mail fica para sempre na caixa de
 * quem recebeu e na de quem encaminhou — e quem cadastrou não precisa mais
 * ligar para ditar a senha.
 */
export function welcomeEmail(
  input: {
    name: string;
    tenantName: string | null;
    url: string;
    minutes: number;
    invitedBy: string | null;
  },
  custom?: Partial<EmailCopy> | null,
): EmailContent {
  const copy = resolveCopy("welcome", custom);
  const vars: Vars = {
    nome: input.name,
    onde: input.tenantName ? `no painel da ${input.tenantName}` : `no ${APP_NAME}`,
    revenda: input.tenantName ?? APP_NAME,
    convidado_por: input.invitedBy ?? `equipe ${APP_NAME}`,
    minutos: String(input.minutes),
  };
  const paragraphs = paragraphsOf(copy.body, vars);
  const footer = line(copy.footer, vars);

  const preheader = line(copy.preheader, vars);

  return {
    subject: line(copy.subject, vars),
    preheader,
    text: plainText(line(copy.title, vars), paragraphs, line(copy.button, vars), input.url, footer),
    html: layout({
      preheader,
      eyebrow: input.tenantName ?? APP_NAME,
      title: line(copy.title, vars),
      body: `${bodyHtml(paragraphs)}
              ${botao(input.url, line(copy.button, vars))}`,
      footer: escapeHtml(footer),
    }),
  };
}

/* ------------------------------------------------------------------------ */
/* Comercial                                                                 */
/* ------------------------------------------------------------------------ */

export type LeadEmailInput = {
  leadName: string;
  phone: string | null;
  email: string | null;
  message: string | null;
  vehicleLabel: string | null;
  /** De onde veio: "site", "Mercado Livre", "OLX Autos"… */
  origin: string;
  /** Link direto para a ficha do lead no painel. */
  url: string;
  tenantName: string;
  /** Para quem o lead já está atribuído, quando há rodízio ligado. */
  assignedTo?: string | null;
};

/**
 * Lead novo para quem vende.
 *
 * O assunto carrega nome e carro porque é o que aparece na notificação do
 * celular — o vendedor decide ali se liga agora. Telefone e e-mail viram
 * link: no celular, tocar disca ou abre o WhatsApp, sem copiar e colar.
 */
export function newLeadEmail(
  input: LeadEmailInput,
  custom?: Partial<EmailCopy> | null,
): EmailContent {
  return leadEmail("newLead", input, custom);
}

/** O mesmo lead, quando ele passa a ser de um vendedor específico. */
export function leadAssignedEmail(
  input: LeadEmailInput,
  custom?: Partial<EmailCopy> | null,
): EmailContent {
  return leadEmail("leadAssigned", input, custom);
}

function leadEmail(
  key: "newLead" | "leadAssigned",
  input: LeadEmailInput,
  custom?: Partial<EmailCopy> | null,
): EmailContent {
  const copy = resolveCopy(key, custom);
  const vars: Vars = {
    nome: input.leadName,
    veiculo: input.vehicleLabel,
    origem: input.origin,
    revenda: input.tenantName,
    responsavel: input.assignedTo,
  };
  const paragraphs = paragraphsOf(copy.body, vars);
  const footer = line(copy.footer, vars);

  const digitos = input.phone?.replace(/\D/g, "") ?? "";
  const whatsapp = digitos
    ? `https://wa.me/${digitos.length > 11 ? digitos : `55${digitos}`}`
    : null;

  const linhasTexto = [
    `Origem: ${input.origin}`,
    input.vehicleLabel ? `Veículo: ${input.vehicleLabel}` : null,
    input.phone ? `Telefone: ${input.phone}` : null,
    input.email ? `E-mail: ${input.email}` : null,
    input.assignedTo ? `Responsável: ${input.assignedTo}` : null,
  ].filter(Boolean) as string[];

  const text = [
    line(copy.title, vars),
    ...paragraphs.map(stripMarks),
    "",
    ...linhasTexto,
    input.message ? `\nMensagem: "${input.message}"` : "",
    "",
    `${line(copy.button, vars)}:`,
    input.url,
  ]
    .filter((linha) => linha !== "")
    .join("\n");

  const itens: { rotulo: string; valor: string }[] = [];
  if (input.vehicleLabel) itens.push({ rotulo: "Veículo", valor: escapeHtml(input.vehicleLabel) });
  if (input.phone) {
    itens.push({
      rotulo: "Telefone",
      valor: `<a href="tel:${escapeHtml(digitos)}" style="color:${TINTA};text-decoration:none">${escapeHtml(input.phone)}</a>`,
    });
  }
  if (input.email) {
    itens.push({
      rotulo: "E-mail",
      valor: `<a href="mailto:${escapeHtml(input.email)}" style="color:${TINTA};text-decoration:none">${escapeHtml(input.email)}</a>`,
    });
  }
  if (input.assignedTo) itens.push({ rotulo: "Responsável", valor: escapeHtml(input.assignedTo) });

  const preheader = input.message ? input.message.slice(0, 90) : line(copy.preheader, vars);

  return {
    subject: line(copy.subject, vars),
    preheader,
    text,
    html: layout({
      preheader,
      eyebrow: input.tenantName,
      title: line(copy.title, vars),
      body: `${bodyHtml(paragraphs)}
              ${dados(itens)}
              ${input.message ? citacao(input.message) : ""}
              ${botao(input.url, line(copy.button, vars))}
              ${
                whatsapp
                  ? `<p style="margin:10px 0 0 0;font-size:14px"><a href="${escapeHtml(whatsapp)}" style="color:${ROXO};text-decoration:none;font-weight:600">Chamar no WhatsApp &rsaquo;</a></p>`
                  : ""
              }`,
      footer: escapeHtml(footer),
    }),
  };
}

/* ------------------------------------------------------------------------ */
/* Amostras                                                                  */
/* ------------------------------------------------------------------------ */

/**
 * Cada modelo com dados de exemplo — para a prévia do editor e para a
 * amostra enviada por e-mail, que assim mostram exatamente a mesma coisa.
 *
 * O link de senha aponta para um token que não existe, de propósito: clicar
 * nele mostra a tela de link inválido, e não abre a conta de ninguém.
 */
export function sampleEmail(
  key: EmailTemplateKey,
  input: { panelUrl: (path: string) => string; userName: string },
  custom?: Partial<EmailCopy> | null,
): EmailContent {
  const lead: LeadEmailInput = {
    leadName: "Ana Souza",
    phone: "(31) 98888-7777",
    email: "ana.souza@exemplo.com",
    message:
      "Tenho interesse nesse Compass. Aceita meu Onix 2019 na troca? Consigo dar entrada de 40 mil.",
    vehicleLabel: "Jeep Compass Longitude 1.3 T270 2023",
    origin: "site",
    url: input.panelUrl("/admin/leads"),
    tenantName: "Revenda de Exemplo",
    assignedTo: "Carlos Vendedor",
  };
  const resetUrl = input.panelUrl("/redefinir-senha?token=amostra-sem-valor");

  switch (key) {
    case "newLead":
      return newLeadEmail(lead, custom);
    case "leadAssigned":
      return leadAssignedEmail(lead, custom);
    case "welcome":
      return welcomeEmail(
        {
          name: input.userName,
          tenantName: "Revenda de Exemplo",
          url: resetUrl,
          minutes: 60,
          invitedBy: `Equipe ${APP_NAME}`,
        },
        custom,
      );
    case "passwordReset":
      return passwordResetEmail({ name: input.userName, url: resetUrl, minutes: 60 }, custom);
  }
}
