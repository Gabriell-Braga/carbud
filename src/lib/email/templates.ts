import { APP_NAME } from "@/lib/brand";

/**
 * Os textos que saem por e-mail.
 *
 * Todos moram aqui, e não junto de quem dispara, por dois motivos: quem mexe
 * em texto não precisa abrir rota de API, e a moldura (assinatura, rodapé,
 * botão) fica igual em todos sem cada um recopiar HTML.
 *
 * Cada e-mail traz versão em texto puro junto com o HTML. Não é capricho:
 * provedor de e-mail corporativo bloqueia HTML com frequência, e mensagem que
 * chega em branco é pior do que não chegar.
 *
 * HTML de e-mail é antigo de propósito — estilo na tag, sem classe e sem
 * folha externa, porque o Gmail remove `<style>` e o Outlook ignora metade do
 * CSS moderno.
 */

export type EmailContent = { subject: string; html: string; text: string };

const ROXO = "#694ae5";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Moldura comum: quem manda, o conteúdo, e o aviso de que ninguém responde. */
function layout(input: { title: string; body: string; footer?: string; sender?: string }): string {
  const remetente = input.sender ?? APP_NAME;

  return `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:15px;line-height:1.55;color:#11111c;max-width:560px">
  <p style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#6b6f76;margin:0 0 18px">${escapeHtml(remetente)}</p>
  <h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(input.title)}</h1>
  ${input.body}
  ${input.footer ? `<p style="color:#6b6f76;font-size:13px;margin-top:22px">${input.footer}</p>` : ""}
</div>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:22px 0"><a href="${escapeHtml(href)}" style="display:inline-block;background:${ROXO};color:#ffffff;padding:13px 22px;border-radius:9999px;text-decoration:none;font-weight:600">${escapeHtml(label)}</a></p>`;
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
      title: "Redefinir sua senha",
      body: `<p>Olá, ${escapeHtml(input.name)}.</p>
  <p>Recebemos um pedido para redefinir a sua senha de acesso ao painel.</p>
  ${button(input.url, "Escolher nova senha")}`,
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
      title: "Bem-vindo(a)",
      body: `<p>Olá, ${escapeHtml(input.name)}.</p>
  <p>Sua conta ${escapeHtml(onde)} foi criada${escapeHtml(quem)}.</p>
  ${button(input.url, "Definir minha senha")}
  <p>Depois disso, é só entrar com o seu e-mail e a senha que você escolher.</p>`,
      footer: `O link vale por ${input.minutes} minutos. Se ele vencer, use "Esqueci minha senha" na tela de acesso.`,
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
 * celular — o vendedor decide ali se liga agora. Telefone e e-mail vão no
 * corpo como link: no celular, tocar disca ou abre o WhatsApp, sem copiar e
 * colar.
 */
export function newLeadEmail(input: LeadEmailInput): EmailContent {
  const assunto = input.vehicleLabel
    ? `Lead novo: ${input.leadName} — ${input.vehicleLabel}`
    : `Lead novo: ${input.leadName}`;

  const linhas = [
    `Origem: ${input.origin}`,
    input.vehicleLabel ? `Veículo: ${input.vehicleLabel}` : null,
    input.phone ? `Telefone: ${input.phone}` : null,
    input.email ? `E-mail: ${input.email}` : null,
    input.assignedTo ? `Responsável: ${input.assignedTo}` : null,
  ].filter(Boolean) as string[];

  const text = [
    `${input.leadName} entrou em contato.`,
    "",
    ...linhas,
    input.message ? `\nMensagem: "${input.message}"` : "",
    "",
    "Abra no painel:",
    input.url,
  ]
    .filter((linha) => linha !== "")
    .join("\n");

  const digitos = input.phone?.replace(/\D/g, "") ?? "";
  const whatsapp = digitos ? `https://wa.me/${digitos.length > 11 ? digitos : `55${digitos}`}` : null;

  const detalhes = linhas
    .map(
      (linha) =>
        `<tr><td style="padding:3px 0;color:#11111c">${escapeHtml(linha)}</td></tr>`,
    )
    .join("");

  return {
    subject: assunto,
    text,
    html: layout({
      sender: input.tenantName,
      title: `${input.leadName} entrou em contato`,
      body: `<table style="border-collapse:collapse;font-size:15px">${detalhes}</table>
  ${input.message ? `<p style="background:#f4f4f7;border-radius:10px;padding:12px 14px;margin:16px 0">${escapeHtml(input.message)}</p>` : ""}
  ${button(input.url, "Abrir no painel")}
  ${whatsapp ? `<p style="font-size:14px"><a href="${escapeHtml(whatsapp)}" style="color:${ROXO}">Chamar no WhatsApp</a></p>` : ""}`,
      footer: "Você recebe este aviso porque atende os leads desta revenda.",
    }),
  };
}

/** O mesmo lead, quando ele passa a ser de um vendedor específico. */
export function leadAssignedEmail(input: LeadEmailInput): EmailContent {
  const base = newLeadEmail(input);
  return {
    ...base,
    subject: input.vehicleLabel
      ? `Lead para você: ${input.leadName} — ${input.vehicleLabel}`
      : `Lead para você: ${input.leadName}`,
  };
}
