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
 */

export type EmailContent = { subject: string; html: string; text: string };

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
/* Acesso                                                                    */
/* ------------------------------------------------------------------------ */

export function passwordResetEmail(input: {
  name: string;
  url: string;
  minutes: number;
}): EmailContent {
  const text = [
    `Olá, ${input.name}.`,
    "",
    "Recebemos um pedido para redefinir a sua senha de acesso ao painel.",
    `Abra este link para escolher uma nova senha (vale por ${input.minutes} minutos):`,
    input.url,
    "",
    "Se não foi você, ignore esta mensagem: nada muda.",
  ].join("\n");

  return {
    subject: "Redefinir sua senha",
    text,
    html: layout({
      preheader: `Link para escolher uma nova senha. Vale por ${input.minutes} minutos.`,
      eyebrow: APP_NAME,
      title: "Redefinir sua senha",
      body: `${paragrafo(`Olá, ${escapeHtml(input.name)}.`)}
              ${paragrafo("Recebemos um pedido para redefinir a sua senha de acesso ao painel. Clique no botão para escolher uma nova.", CINZA)}
              ${botao(input.url, "Escolher nova senha")}`,
      footer: `O link vale por ${input.minutes} minutos. Se não foi você, ignore esta mensagem: nada muda.`,
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
export function welcomeEmail(input: {
  name: string;
  tenantName: string | null;
  url: string;
  minutes: number;
  invitedBy: string | null;
}): EmailContent {
  const onde = input.tenantName ? `no painel da ${input.tenantName}` : `no ${APP_NAME}`;
  const quem = input.invitedBy ? ` por ${input.invitedBy}` : "";

  const text = [
    `Olá, ${input.name}.`,
    "",
    `Sua conta ${onde} foi criada${quem}.`,
    `Defina sua senha por este link (vale por ${input.minutes} minutos):`,
    input.url,
    "",
    "Depois disso, é só entrar com o seu e-mail e a senha que você escolher.",
  ].join("\n");

  return {
    subject: `Seu acesso ${onde}`,
    text,
    html: layout({
      preheader: "Sua conta foi criada. Defina sua senha para entrar.",
      eyebrow: input.tenantName ?? APP_NAME,
      title: `Bem-vindo(a), ${input.name}`,
      body: `${paragrafo(`Sua conta ${escapeHtml(onde)} foi criada${escapeHtml(quem)}.`, CINZA)}
              ${paragrafo("Escolha sua senha e o acesso está pronto.")}
              ${botao(input.url, "Definir minha senha")}`,
      footer: `O link vale por ${input.minutes} minutos. Se ele vencer, use “Esqueci minha senha” na tela de acesso.`,
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
export function newLeadEmail(input: LeadEmailInput): EmailContent {
  const assunto = input.vehicleLabel
    ? `Lead novo: ${input.leadName} — ${input.vehicleLabel}`
    : `Lead novo: ${input.leadName}`;

  const digitos = input.phone?.replace(/\D/g, "") ?? "";
  const whatsapp = digitos ? `https://wa.me/${digitos.length > 11 ? digitos : `55${digitos}`}` : null;

  const linhasTexto = [
    `Origem: ${input.origin}`,
    input.vehicleLabel ? `Veículo: ${input.vehicleLabel}` : null,
    input.phone ? `Telefone: ${input.phone}` : null,
    input.email ? `E-mail: ${input.email}` : null,
    input.assignedTo ? `Responsável: ${input.assignedTo}` : null,
  ].filter(Boolean) as string[];

  const text = [
    `${input.leadName} entrou em contato.`,
    "",
    ...linhasTexto,
    input.message ? `\nMensagem: "${input.message}"` : "",
    "",
    "Abra no painel:",
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

  return {
    subject: assunto,
    text,
    html: layout({
      preheader: input.message
        ? input.message.slice(0, 90)
        : `Contato novo pelo ${input.origin}. Responda rápido.`,
      eyebrow: input.tenantName,
      title: `${input.leadName} entrou em contato`,
      body: `${paragrafo(`Chegou agora pelo <strong style="color:${TINTA}">${escapeHtml(input.origin)}</strong>.`, CINZA)}
              ${dados(itens)}
              ${input.message ? citacao(input.message) : ""}
              ${botao(input.url, "Abrir no painel")}
              ${
                whatsapp
                  ? `<p style="margin:10px 0 0 0;font-size:14px"><a href="${escapeHtml(whatsapp)}" style="color:${ROXO};text-decoration:none;font-weight:600">Chamar no WhatsApp &rsaquo;</a></p>`
                  : ""
              }`,
      footer: "Você recebe este aviso porque atende os leads desta revenda.",
    }),
  };
}

/** O mesmo lead, quando ele passa a ser de um vendedor específico. */
export function leadAssignedEmail(input: LeadEmailInput): EmailContent {
  const base = newLeadEmail(input);
  const assunto = input.vehicleLabel
    ? `Lead para você: ${input.leadName} — ${input.vehicleLabel}`
    : `Lead para você: ${input.leadName}`;

  return {
    subject: assunto,
    text: base.text,
    html: base.html
      .replace(
        `${escapeHtml(input.leadName)} entrou em contato`,
        `${escapeHtml(input.leadName)} é seu`,
      )
      .replace(
        "Você recebe este aviso porque atende os leads desta revenda.",
        "Este lead foi atribuído a você. Ele também aparece no seu funil.",
      ),
  };
}
