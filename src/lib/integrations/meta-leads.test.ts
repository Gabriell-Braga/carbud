import { describe, expect, it } from "vitest";
import { mapLeadgenFields, parseLeadgenNotices } from "./meta-leads";

describe("parseLeadgenNotices", () => {
  it("pega só mudanças de cadastro da página", () => {
    const notices = parseLeadgenNotices({
      object: "page",
      entry: [
        {
          id: "111",
          changes: [
            { field: "leadgen", value: { leadgen_id: 999, page_id: "111", form_id: "55" } },
            { field: "feed", value: { post_id: "1" } },
          ],
        },
      ],
    });
    expect(notices).toEqual([{ pageId: "111", leadgenId: "999", formId: "55", adId: null }]);
  });

  it("ignora webhook de outro objeto", () => {
    expect(parseLeadgenNotices({ object: "whatsapp_business_account", entry: [] })).toEqual([]);
  });
});

describe("mapLeadgenFields", () => {
  it("junta primeiro nome e sobrenome e manda perguntas extras para a mensagem", () => {
    expect(
      mapLeadgenFields([
        { name: "first_name", values: ["Ana"] },
        { name: "last_name", values: ["Souza"] },
        { name: "phone_number", values: ["+5511999990000"] },
        { name: "EMAIL", values: ["Ana@Ex.com"] },
        { name: "tem_carro_na_troca?", values: ["sim"] },
      ]),
    ).toEqual({
      name: "Ana Souza",
      phone: "+5511999990000",
      email: "ana@ex.com",
      message: "tem carro na troca?: sim",
    });
  });

  it("sem nome nenhum, ainda cria o lead", () => {
    expect(mapLeadgenFields([]).name).toBe("Contato do anúncio");
  });
});
