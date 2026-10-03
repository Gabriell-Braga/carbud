import { describe, expect, it } from "vitest";
import { normalizeInboundLead } from "@/lib/integrations/portal-lead-inbox";
import { mercadoLivreLeadKey, questionResource } from "./portal-leads";

describe("questionResource", () => {
  it("aceita o caminho de pergunta que o ML manda", () => {
    expect(questionResource("/questions/12345678")).toBe("/questions/12345678");
  });

  /*
   * O caminho vem do aviso do portal e vira chamada autenticada com o token
   * da revenda. Aceitar qualquer coisa deixaria um aviso forjado escolher o
   * que buscamos na conta dela.
   */
  it("recusa caminho que nao seja de pergunta", () => {
    expect(questionResource("/users/42")).toBeNull();
    expect(questionResource("/questions/12/../../users/42")).toBeNull();
    expect(questionResource("https://api.mercadolibre.com/questions/12")).toBeNull();
    expect(questionResource("/questions/")).toBeNull();
  });
});

describe("mercadoLivreLeadKey", () => {
  const pergunta = {
    id: "1",
    itemId: "MLB123",
    text: "Aceita troca?",
    fromUserId: "4242",
    createdAt: null,
    answered: false,
  };

  it("identifica o lead por anuncio e comprador, nao por pergunta", () => {
    expect(mercadoLivreLeadKey(pergunta)).toBe("mercadolivre:MLB123:4242");
    // segunda pergunta da mesma pessoa no mesmo carro: mesma chave, mesmo lead
    expect(mercadoLivreLeadKey({ ...pergunta, id: "2" })).toBe("mercadolivre:MLB123:4242");
  });

  it("separa compradores diferentes e anuncios diferentes", () => {
    expect(mercadoLivreLeadKey({ ...pergunta, fromUserId: "9" })).toBe("mercadolivre:MLB123:9");
    expect(mercadoLivreLeadKey({ ...pergunta, itemId: "MLB999" })).toBe("mercadolivre:MLB999:4242");
  });
});

describe("normalizeInboundLead", () => {
  it("le o formato mais comum, em portugues", () => {
    const result = normalizeInboundLead("icarros", {
      nome: "Ana Souza",
      telefone: "(31) 98888-7777",
      email: "ANA@EXEMPLO.COM",
      mensagem: "Tenho interesse",
      anuncio_id: "OLX-123",
      link: "https://olx.com.br/anuncio/123",
    });

    expect(result).toEqual({
      ok: true,
      lead: {
        portal: "icarros",
        externalId: "icarros:OLX-123:31988887777",
        name: "Ana Souza",
        phone: "31988887777",
        email: "ana@exemplo.com",
        message: "Tenho interesse",
        messageId: null,
        adExternalId: "OLX-123",
        url: "https://olx.com.br/anuncio/123",
      },
    });
  });

  it("le o formato documentado da OLX sem confundir o id do lead com o do anuncio", () => {
    const result = normalizeInboundLead("olx", {
      source: "whatsapp",
      adId: "a1234",
      listId: "12345689",
      linkAd: "https://www.olx.com.br/vi/12345689",
      name: "Nome do cliente",
      email: "Cliente@Gmail.com",
      phone: "2199999999",
      message: "Olá, gostaria de saber mais",
      createdAt: "2019-02-12T14:30:00.500Z",
      externalId: "123jdanjkdna-danjndaada",
    });
    expect(result).toEqual({
      ok: true,
      lead: {
        portal: "olx",
        externalId: "olx:lead:123jdanjkdna-danjndaada",
        name: "Nome do cliente",
        phone: "2199999999",
        email: "cliente@gmail.com",
        message: "WhatsApp: Olá, gostaria de saber mais",
        messageId: "123jdanjkdna-danjndaada",
        adExternalId: "a1234",
        url: "https://www.olx.com.br/vi/12345689",
      },
    });
  });

  it("le o formato em ingles e o lead embrulhado, que e como varios integradores mandam", () => {
    const result = normalizeInboundLead("webmotors", {
      lead: { customer_name: "Bruno", phone_number: "31977776666", comment: "Aceita troca?" },
      listing_id: "WM-9",
    });
    expect(result.ok && result.lead).toMatchObject({
      name: "Bruno",
      phone: "31977776666",
      message: "Aceita troca?",
      adExternalId: "WM-9",
    });
  });

  /*
   * O id do portal manda na identidade quando existe: dois contatos da mesma
   * pessoa no mesmo anuncio sao dois leads para o portal, e repetir o mesmo id
   * e reenvio.
   */
  it("usa o protocolo do portal como identidade quando ele vem", () => {
    const comId = normalizeInboundLead("icarros", {
      nome: "Ana",
      telefone: "31988887777",
      lead_id: "IC-77",
      anuncio: "IC-1",
    });
    expect(comId.ok && comId.lead.externalId).toBe("icarros:lead:IC-77");
    expect(comId.ok && comId.lead.messageId).toBe("IC-77");
  });

  it("sem anuncio, o lead ainda entra: melhor sem carro do que perdido", () => {
    const result = normalizeInboundLead("olx", { nome: "Ana", email: "ana@exemplo.com" });
    expect(result.ok && result.lead.externalId).toBe("olx:sem-anuncio:ana@exemplo.com");
    expect(result.ok && result.lead.phone).toBeNull();
  });

  it("recusa o que nao da como responder, e diz por que", () => {
    expect(normalizeInboundLead("olx", { nome: "Ana" })).toEqual({
      ok: false,
      reason: "Informe ao menos telefone ou e-mail de quem procurou.",
    });
    expect(normalizeInboundLead("olx", null).ok).toBe(false);
    expect(normalizeInboundLead("olx", [1, 2]).ok).toBe(false);
  });
});
