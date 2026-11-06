import { describe, expect, it } from "vitest";
import {
  isOptOutMessage,
  isWindowOpen,
  parseInboundMessages,
  phoneVariants,
  samePhone,
  sendMode,
  toE164Digits,
  WINDOW_MS,
  windowMinutesLeft,
} from "./whatsapp-rules";

const agora = new Date("2026-09-02T12:00:00.000Z").getTime();

describe("janela de 24 horas", () => {
  it("abre quando o cliente falou há pouco", () => {
    expect(isWindowOpen(new Date(agora - 60_000), agora)).toBe(true);
  });

  it("fecha depois de 24 horas", () => {
    expect(isWindowOpen(new Date(agora - WINDOW_MS - 1), agora)).toBe(false);
  });

  it("está fechada para quem nunca escreveu", () => {
    // lead do site nunca mandou mensagem: primeiro contato é sempre template
    expect(isWindowOpen(null, agora)).toBe(false);
    expect(sendMode(null, agora)).toBe("template");
  });

  it("exige template fora da janela e libera texto livre dentro", () => {
    expect(sendMode(new Date(agora - 60_000), agora)).toBe("texto_livre");
    expect(sendMode(new Date(agora - WINDOW_MS - 1), agora)).toBe("template");
  });

  it("no limite exato dos 24h já considera fechada", () => {
    expect(isWindowOpen(new Date(agora - WINDOW_MS), agora)).toBe(false);
  });

  it("informa quanto resta, e zero quando acabou", () => {
    expect(windowMinutesLeft(new Date(agora - 60 * 60_000), agora)).toBe(23 * 60);
    expect(windowMinutesLeft(new Date(agora - WINDOW_MS), agora)).toBe(0);
    expect(windowMinutesLeft(null, agora)).toBe(0);
  });
});

describe("normalização de telefone", () => {
  it("acrescenta o país quando falta", () => {
    expect(toE164Digits("11999998888")).toBe("5511999998888");
  });

  it("não duplica o país", () => {
    expect(toE164Digits("5511999998888")).toBe("5511999998888");
  });

  it("ignora máscara e sinal de mais", () => {
    expect(toE164Digits("+55 (11) 99999-8888")).toBe("5511999998888");
  });
});

describe("nono dígito", () => {
  it("gera a forma sem o nono a partir da forma com", () => {
    // a Meta devolve as duas formas conforme o número e a época do cadastro
    expect(phoneVariants("5511999998888")).toContain("551199998888");
  });

  it("gera a forma com o nono a partir da forma sem", () => {
    expect(phoneVariants("551199998888")).toContain("5511999998888");
  });

  it("reconhece as duas grafias como o mesmo número", () => {
    // sem isso a mensagem do cliente não acha o lead e vira conversa de estranho
    expect(samePhone("11999998888", "551199998888")).toBe(true);
    expect(samePhone("+55 11 99999-8888", "5511999998888")).toBe(true);
  });

  it("não confunde números diferentes", () => {
    expect(samePhone("11999998888", "11999998887")).toBe(false);
    expect(samePhone("11999998888", "21999998888")).toBe(false);
  });

  it("não inventa variante para fixo de oito dígitos que não começa com 9", () => {
    const variantes = phoneVariants("551133334444");
    expect(variantes).toContain("5511933334444");
    expect(variantes.length).toBe(2);
  });
});

describe("leitura do webhook", () => {
  const base = (messages: unknown[]) => ({
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: "123" },
              contacts: [{ profile: { name: "Ana" }, wa_id: "5511999998888" }],
              messages,
            },
          },
        ],
      },
    ],
  });

  it("lê uma mensagem de texto", () => {
    const [message] = parseInboundMessages(
      base([
        { id: "wamid.1", from: "5511999998888", timestamp: "1788000000", type: "text", text: { body: "Oi" } },
      ]),
    );
    expect(message.externalId).toBe("wamid.1");
    expect(message.text).toBe("Oi");
    expect(message.from).toBe("5511999998888");
    expect(message.senderName).toBe("Ana");
    expect(message.phoneNumberId).toBe("123");
  });

  it("converte o horário de segundos para milissegundos", () => {
    const [message] = parseInboundMessages(
      base([{ id: "w", from: "55119", timestamp: "1788000000", type: "text", text: { body: "x" } }]),
    );
    expect(message.timestamp.getTime()).toBe(1_788_000_000_000);
  });

  it("ignora atualização de status, que não é mensagem", () => {
    // entrega e leitura chegam pelo mesmo webhook; registrá-las criaria
    // "conversa" que ninguém escreveu
    const payload = {
      entry: [{ changes: [{ value: { metadata: { phone_number_id: "123" }, statuses: [{ id: "x" }] } }] }],
    };
    expect(parseInboundMessages(payload)).toEqual([]);
  });

  it("marca de forma legível o que não é texto", () => {
    const [message] = parseInboundMessages(
      base([{ id: "w", from: "55119", timestamp: "1", type: "image" }]),
    );
    expect(message.text).toBe("[foto]");
  });

  it("lê resposta de botão como texto", () => {
    const [message] = parseInboundMessages(
      base([
        {
          id: "w",
          from: "55119",
          timestamp: "1",
          type: "interactive",
          interactive: { button_reply: { title: "Quero visitar" } },
        },
      ]),
    );
    expect(message.text).toBe("Quero visitar");
  });

  it("lê várias mensagens da mesma entrega", () => {
    const messages = parseInboundMessages(
      base([
        { id: "a", from: "55119", timestamp: "1", type: "text", text: { body: "um" } },
        { id: "b", from: "55119", timestamp: "2", type: "text", text: { body: "dois" } },
      ]),
    );
    expect(messages).toHaveLength(2);
  });

  it("não quebra com corpo vazio ou fora do formato", () => {
    expect(parseInboundMessages({})).toEqual([]);
    expect(parseInboundMessages(null)).toEqual([]);
    expect(parseInboundMessages({ entry: [{}] })).toEqual([]);
  });

  it("descarta mensagem sem id ou sem remetente", () => {
    expect(parseInboundMessages(base([{ from: "55119", timestamp: "1", type: "text" }]))).toEqual([]);
    expect(parseInboundMessages(base([{ id: "a", timestamp: "1", type: "text" }]))).toEqual([]);
  });
});

describe("contagem de variáveis do template da Meta", () => {
  it("conta as posições distintas", async () => {
    const { countPlaceholders } = await import("./whatsapp-client");
    expect(countPlaceholders("Olá {{1}}, o {{2}} está disponível")).toBe(2);
  });

  it("não conta a mesma posição duas vezes", async () => {
    const { countPlaceholders } = await import("./whatsapp-client");
    expect(countPlaceholders("{{1}} e de novo {{1}}")).toBe(1);
  });

  it("devolve zero para template sem variável", async () => {
    const { countPlaceholders } = await import("./whatsapp-client");
    expect(countPlaceholders("Mensagem fixa")).toBe(0);
  });
});

describe("assinatura do webhook da Meta", () => {
  const segredo = "app-secret-de-teste";
  const corpo = '{"entry":[{"id":"1"}]}';

  async function assinar(body: string, secret: string): Promise<string> {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
    return `sha256=${[...new Uint8Array(signature)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")}`;
  }

  it("aceita assinatura correta", async () => {
    const { verifySignature } = await import("./whatsapp-client");
    expect(await verifySignature(corpo, await assinar(corpo, segredo), segredo)).toBe(true);
  });

  it("recusa corpo adulterado", async () => {
    const { verifySignature } = await import("./whatsapp-client");
    const assinatura = await assinar(corpo, segredo);
    expect(await verifySignature('{"entry":[{"id":"2"}]}', assinatura, segredo)).toBe(false);
  });

  it("recusa assinatura de outro segredo", async () => {
    const { verifySignature } = await import("./whatsapp-client");
    expect(await verifySignature(corpo, await assinar(corpo, "outro"), segredo)).toBe(false);
  });

  it("recusa cabeçalho ausente ou sem o prefixo", async () => {
    const { verifySignature } = await import("./whatsapp-client");
    expect(await verifySignature(corpo, null, segredo)).toBe(false);
    expect(await verifySignature(corpo, "abc123", segredo)).toBe(false);
  });
});

describe("pedido de descadastro", () => {
  it("aceita a palavra sozinha, com acento e pontuação", () => {
    expect(isOptOutMessage("SAIR")).toBe(true);
    expect(isOptOutMessage(" Parar. ")).toBe(true);
    expect(isOptOutMessage("Parar promoções")).toBe(true);
  });

  it("não confunde frase que só contém a palavra", () => {
    expect(isOptOutMessage("não quero sair agora")).toBe(false);
    expect(isOptOutMessage("Sim")).toBe(false);
  });
});
