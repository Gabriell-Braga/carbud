/**
 * Regras do WhatsApp oficial que não dependem de rede.
 *
 * Separadas do cliente HTTP porque são a parte que erra em silêncio: mandar
 * texto livre fora da janela é recusado pela Meta, e telefone normalizado
 * errado faz a resposta do cliente não encontrar o lead dele.
 */

export const WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * A janela de atendimento abre quando o cliente fala e dura 24 horas.
 *
 * Dentro dela, texto livre. Fora, só template aprovado pela Meta. Lead que
 * chega pelo site nunca mandou mensagem, então o primeiro contato é SEMPRE
 * template — é a regra que mais confunde quem monta isso pela primeira vez.
 */
export function isWindowOpen(lastInboundAt: Date | null | undefined, now = Date.now()): boolean {
  if (!lastInboundAt) return false;
  return now - lastInboundAt.getTime() < WINDOW_MS;
}

export type SendMode = "texto_livre" | "template";

export function sendMode(lastInboundAt: Date | null | undefined, now = Date.now()): SendMode {
  return isWindowOpen(lastInboundAt, now) ? "texto_livre" : "template";
}

/** Quanto ainda resta da janela, em minutos. Zero quando fechada. */
export function windowMinutesLeft(
  lastInboundAt: Date | null | undefined,
  now = Date.now(),
): number {
  if (!lastInboundAt) return 0;
  const left = WINDOW_MS - (now - lastInboundAt.getTime());
  return left <= 0 ? 0 : Math.floor(left / 60_000);
}

/* ------------------------------------------------------------------------ */
/* Telefone                                                                  */
/* ------------------------------------------------------------------------ */

/**
 * Número no formato que a API da Meta espera: só dígitos, com país.
 *
 * Aceita o que a revenda digitou de qualquer jeito — com máscara, com +55,
 * sem nada.
 */
export function toE164Digits(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  return `55${digits}`;
}

/**
 * Todas as formas em que o mesmo celular brasileiro pode aparecer.
 *
 * A Meta devolve o número do remetente às vezes COM o nono dígito e às vezes
 * SEM — é herança da época em que os celulares tinham oito dígitos, e vale
 * para os DDDs até 30. Comparar string com string faz a mensagem do cliente
 * não encontrar o lead dele, e a conversa aparece como se fosse de um
 * desconhecido.
 *
 * Por isso comparamos por conjunto: geramos as duas formas e procuramos
 * qualquer uma.
 */
export function phoneVariants(phone: string): string[] {
  const full = toE164Digits(phone);
  const rest = full.slice(2);
  const variants = new Set<string>([full]);

  // 55 + DDD(2) + 9 dígitos: existe a forma sem o nono
  if (rest.length === 11 && rest[2] === "9") {
    variants.add(`55${rest.slice(0, 2)}${rest.slice(3)}`);
  }

  // 55 + DDD(2) + 8 dígitos: existe a forma com o nono
  if (rest.length === 10) {
    variants.add(`55${rest.slice(0, 2)}9${rest.slice(2)}`);
  }

  return [...variants];
}

/** Duas grafias do mesmo número? */
export function samePhone(a: string, b: string): boolean {
  const left = new Set(phoneVariants(a));
  return phoneVariants(b).some((variant) => left.has(variant));
}

/* ------------------------------------------------------------------------ */
/* Corpo do webhook                                                          */
/* ------------------------------------------------------------------------ */

export type InboundMessage = {
  externalId: string;
  from: string;
  text: string;
  timestamp: Date;
  phoneNumberId: string;
  senderName: string | null;
};

type WebhookPayload = {
  entry?: {
    changes?: {
      value?: {
        metadata?: { phone_number_id?: string };
        contacts?: { profile?: { name?: string }; wa_id?: string }[];
        messages?: {
          id?: string;
          from?: string;
          timestamp?: string;
          type?: string;
          text?: { body?: string };
          button?: { text?: string };
          interactive?: {
            button_reply?: { title?: string };
            list_reply?: { title?: string };
          };
        }[];
      };
    }[];
  }[];
};

/**
 * Extrai as mensagens recebidas do corpo que a Meta manda.
 *
 * O formato é aninhado em três níveis e cada nível é opcional na
 * documentação. Uma entrega pode trazer várias mensagens, e traz também
 * atualizações de status (entregue, lido) que não são mensagens — ignorá-las
 * aqui evita registrar "conversa" que ninguém escreveu.
 *
 * Tipos sem texto (áudio, imagem, documento) viram uma marca legível em vez de
 * sumirem: quem lê o histórico precisa saber que o cliente mandou algo.
 */
export function parseInboundMessages(payload: unknown): InboundMessage[] {
  const body = payload as WebhookPayload;
  const messages: InboundMessage[] = [];

  for (const entry of body?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value;
      const phoneNumberId = value?.metadata?.phone_number_id;
      if (!phoneNumberId) continue;

      const senderName = value?.contacts?.[0]?.profile?.name ?? null;

      for (const message of value?.messages ?? []) {
        if (!message?.id || !message?.from) continue;

        const text =
          message.text?.body ??
          message.interactive?.button_reply?.title ??
          message.interactive?.list_reply?.title ??
          message.button?.text ??
          describeNonText(message.type);

        messages.push({
          externalId: message.id,
          from: message.from,
          text,
          // a Meta manda segundos; Date espera milissegundos
          timestamp: new Date(Number(message.timestamp ?? 0) * 1000),
          phoneNumberId,
          senderName,
        });
      }
    }
  }

  return messages;
}

function describeNonText(type: string | undefined): string {
  const labels: Record<string, string> = {
    image: "[foto]",
    audio: "[áudio]",
    video: "[vídeo]",
    document: "[documento]",
    location: "[localização]",
    sticker: "[figurinha]",
    contacts: "[contato]",
  };
  return labels[type ?? ""] ?? "[mensagem não suportada]";
}

const OPT_OUT_WORDS = new Set(["sair", "parar", "pare", "stop", "cancelar", "descadastrar"]);

/**
 * O cliente pediu para não receber mais campanha.
 *
 * Só a mensagem inteira conta: "não quero sair agora" não é pedido de
 * descadastro. Também aceita o botão "Parar promoções" que a Meta oferece
 * nos modelos de marketing.
 */
export function isOptOutMessage(text: string): boolean {
  const normalized = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z ]/g, "")
    .trim();
  return OPT_OUT_WORDS.has(normalized) || normalized === "parar promocoes";
}
