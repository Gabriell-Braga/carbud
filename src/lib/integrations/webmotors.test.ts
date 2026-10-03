import { afterEach, describe, expect, it, vi } from "vitest";
import { getPortal } from "./portals";
import { parseLeadDetail, parseLeadNotice, webmotorsApiBase, webmotorsToken } from "./webmotors";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("aviso de lead", () => {
  it("lê o corpo que o Webmotors manda na CALLBACK URL LEADS", () => {
    expect(
      parseLeadNotice({
        IdLead: "424722",
        CodigoCliente: "3823863",
        Cnpj: "03.347.828/0001-09",
        IdTipoLead: "1",
      }),
    ).toEqual({
      leadId: "424722",
      clientCode: "3823863",
      cnpj: "03347828000109",
      leadType: "1",
    });
  });

  it("recusa o que não tem id de lead ou tipo", () => {
    expect(parseLeadNotice({ Cnpj: "03347828000109" })).toBeNull();
    expect(parseLeadNotice({ IdLead: "1" })).toBeNull();
    expect(parseLeadNotice(null)).toBeNull();
  });
});

describe("detalhe do lead", () => {
  const notice = { leadId: "460046", clientCode: "1", cnpj: "03347828000109", leadType: "2" };

  it("vira lead do CRM, com a placa para achar o carro", () => {
    const lead = parseLeadDetail(
      {
        id: 460046,
        status: "Não respondido",
        tipoLeadDesc: "Proposta",
        mensagem: "Aceita troca?",
        cliente: { nome: "Comprador Teste", email: "c@x.com", telefone: "(11) 98888-7777" },
        loja: { id: 1, nomeFantasia: "Loja" },
        anuncio: { id: 999, marca: "Fiat", modelo: "Uno", placa: "abc-1d23" },
        vendedor: { id: 5, nome: "Vendedor" },
      },
      notice,
    );
    expect(lead).toMatchObject({
      portal: "webmotors",
      externalId: "webmotors:460046",
      name: "Comprador Teste",
      phone: "11988887777",
      email: "c@x.com",
      message: "Proposta: Aceita troca?",
      messageId: "460046",
      adExternalId: "999",
      plate: "ABC1D23",
    });
  });

  it("não confunde o nome da loja ou do vendedor com o de quem procurou", () => {
    const lead = parseLeadDetail(
      { Retorno: { nome: "Fulano", telefone: "11999990000", loja: { nome: "Loja" } } },
      notice,
    );
    expect(lead.name).toBe("Fulano");
    expect(lead.phone).toBe("11999990000");
  });
});

describe("cliente", () => {
  it("usa homologação até o ambiente dizer outro endereço", () => {
    expect(webmotorsApiBase()).toBe("https://hlg-webmotors.sensedia.com");
    vi.stubEnv("WEBMOTORS_API_URL", "https://webmotors.sensedia.com/");
    expect(webmotorsApiBase()).toBe("https://webmotors.sensedia.com");
  });

  it("pede o token com o app em Basic e o usuário da loja no corpo", async () => {
    const fetchMock = vi.fn(async () => Response.json({ access_token: "tok" }, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    const token = await webmotorsToken(
      { clientId: "id", clientSecret: "segredo" },
      { username: "loja@x.com", password: "senha" },
    );
    expect(token).toBe("tok");

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://hlg-webmotors.sensedia.com/oauth/v1/access-token");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Basic ${btoa("id:segredo")}`,
    );
    expect(JSON.parse(String(init.body))).toEqual({
      username: "loja@x.com",
      password: "senha",
      grant_type: "password",
    });
  });

  it("senha errada diz onde conferir", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ error: "invalid" }, { status: 401 }));
    await expect(
      webmotorsToken({ clientId: "id", clientSecret: "s" }, { username: "a", password: "b" }),
    ).rejects.toThrow(/Integrador de API/);
  });
});

describe("catálogo", () => {
  it("a loja informa CNPJ e o usuário Integrador de API, e não cadastra URL de leads", () => {
    const webmotors = getPortal("webmotors")!;
    const required = webmotors.fields.filter((field) => !field.optional);
    expect(required.map((field) => field.key)).toEqual(["cnpj", "username", "password"]);
    expect(webmotors.fields.find((field) => field.key === "password")?.secret).toBe(true);
    expect(webmotors.appLeadWebhook).toBe(true);
    expect(webmotors.importsFeed).toBeFalsy();
  });

  it("o estoque é opcional e usa outro usuário, o Integração Revendedor", () => {
    const webmotors = getPortal("webmotors")!;
    const stock = webmotors.fields.filter((field) => field.optional);
    expect(stock.map((field) => field.key)).toEqual(["stockEmail", "stockPassword"]);
    expect(stock.find((field) => field.key === "stockPassword")?.secret).toBe(true);
    expect(webmotors.adTypes).toBe("plan");
  });
});
