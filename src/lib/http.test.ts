import { afterEach, describe, expect, it, vi } from "vitest";
import { clientIp } from "./http";

function request(headers: Record<string, string>) {
  return new Request("https://painel.test/api/leads", { headers });
}

describe("clientIp", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("usa o IP do visitante repassado pelo app dos sites quando a chave confere", () => {
    vi.stubEnv("SITES_API_KEY", "segredo");
    const ip = clientIp(
      request({ "cf-connecting-ip": "76.76.21.1", "x-visitor-ip": "200.1.2.3", "x-sites-key": "segredo" }),
    );
    expect(ip).toBe("200.1.2.3");
  });

  it("ignora x-visitor-ip sem a chave, senão qualquer um fugiria do limite", () => {
    vi.stubEnv("SITES_API_KEY", "segredo");
    expect(clientIp(request({ "cf-connecting-ip": "1.1.1.1", "x-visitor-ip": "9.9.9.9" }))).toBe("1.1.1.1");

    vi.stubEnv("SITES_API_KEY", "");
    expect(clientIp(request({ "cf-connecting-ip": "1.1.1.1", "x-visitor-ip": "9.9.9.9" }))).toBe("1.1.1.1");
  });
});
