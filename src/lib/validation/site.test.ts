import { describe, expect, it } from "vitest";
import { siteSettingsSchema } from "./site";

describe("configurações do site", () => {
  it("telefone, e-mail e textos apagados limpam a coluna", () => {
    const data = siteSettingsSchema.parse({
      phone: "",
      email: "",
      addressStreet: "",
      aboutTitle: "",
      mapsUrl: "",
    });
    expect(data).toMatchObject({
      phone: null,
      email: null,
      addressStreet: null,
      aboutTitle: null,
      mapsUrl: null,
    });
  });

  it("campo ausente não aparece no update", () => {
    const data = siteSettingsSchema.parse({ phone: "2733221100" });
    expect(Object.keys(data)).toEqual(["phone"]);
  });

  it("e-mail é normalizado e e-mail inválido é recusado", () => {
    expect(siteSettingsSchema.parse({ email: " Contato@Loja.COM " }).email).toBe("contato@loja.com");
    expect(siteSettingsSchema.safeParse({ email: "contato@" }).success).toBe(false);
  });

  it("GTM fora do formato é recusado", () => {
    expect(siteSettingsSchema.safeParse({ gtmCode: "GTM-ABC1234" }).success).toBe(true);
    expect(siteSettingsSchema.safeParse({ gtmCode: "<script>" }).success).toBe(false);
    expect(siteSettingsSchema.safeParse({ gtmCode: "UA-123" }).success).toBe(false);
  });

  it("cor do tema só aceita hexadecimal", () => {
    expect(siteSettingsSchema.safeParse({ theme: { primary: "#1a2b3c" } }).success).toBe(true);
    expect(siteSettingsSchema.safeParse({ theme: { primary: "red;}" } }).success).toBe(false);
  });

  it("campos do formulário do WhatsApp só aceitam os do catálogo", () => {
    expect(siteSettingsSchema.safeParse({ whatsappFormFields: ["name", "tradeIn"] }).success).toBe(true);
    expect(siteSettingsSchema.safeParse({ whatsappFormFields: ["cpf"] }).success).toBe(false);
  });

  it("link do mapa precisa ser URL", () => {
    expect(siteSettingsSchema.safeParse({ mapsUrl: "javascript:alert(1)" }).success).toBe(false);
  });
});
