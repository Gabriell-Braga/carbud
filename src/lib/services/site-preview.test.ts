import { describe, expect, it } from "vitest";
import { parseSitePreview } from "./site-preview";

const raw = (data: unknown) => JSON.stringify(data);

describe("parseSitePreview", () => {
  it("aceita a prévia da própria revenda", () => {
    expect(
      parseSitePreview(raw({ slug: "loja", templateId: "showroom", theme: { primary: "#112233" } }), "loja"),
    ).toEqual({ templateId: "showroom", theme: { primary: "#112233" } });
  });

  it("ignora cookie de outra revenda, template em breve, cor inválida e lixo", () => {
    expect(parseSitePreview(raw({ slug: "outra", templateId: "showroom" }), "loja")).toBeNull();
    expect(parseSitePreview(raw({ slug: "loja", templateId: "nao-existe" }), "loja")).toBeNull();
    expect(
      parseSitePreview(raw({ slug: "loja", templateId: "vitrine", theme: { primary: "red;x" } }), "loja"),
    ).toBeNull();
    expect(parseSitePreview("{quebrado", "loja")).toBeNull();
    expect(parseSitePreview(undefined, "loja")).toBeNull();
  });
});
