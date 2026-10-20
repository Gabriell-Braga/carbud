import { describe, expect, it } from "vitest";
import { safeHref } from "./links";

describe("safeHref", () => {
  it("deixa passar o que é link de verdade", () => {
    expect(safeHref("https://maps.google.com/?q=loja")).toBe("https://maps.google.com/?q=loja");
    expect(safeHref("http://instagram.com/loja")).toBe("http://instagram.com/loja");
    expect(safeHref("/estoque?marca=fiat")).toBe("/estoque?marca=fiat");
    expect(safeHref("#contato")).toBe("#contato");
    expect(safeHref("mailto:contato@loja.com")).toBe("mailto:contato@loja.com");
    expect(safeHref("tel:+552733221100")).toBe("tel:+552733221100");
  });

  it("barra o que executaria código ou sairia do site disfarçado", () => {
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref(" JavaScript:alert(1)")).toBeNull();
    expect(safeHref("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(safeHref("vbscript:msgbox")).toBeNull();
    expect(safeHref("//site-malicioso.com")).toBeNull();
  });

  it("domínio digitado sem https ganha o https", () => {
    expect(safeHref("instagram.com/phvmotors")).toBe("https://instagram.com/phvmotors");
    expect(safeHref("www.facebook.com/loja")).toBe("https://www.facebook.com/loja");
    expect(safeHref("maps.app.goo.gl/abc123")).toBe("https://maps.app.goo.gl/abc123");
  });

  it("texto que não é link continua barrado", () => {
    expect(safeHref("@phvmotors")).toBeNull();
    expect(safeHref("minha loja")).toBeNull();
  });

  it("vazio vira null", () => {
    expect(safeHref("")).toBeNull();
    expect(safeHref("   ")).toBeNull();
    expect(safeHref(null)).toBeNull();
    expect(safeHref(undefined)).toBeNull();
  });
});
