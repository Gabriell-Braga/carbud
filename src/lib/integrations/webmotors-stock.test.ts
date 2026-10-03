import { describe, expect, it, vi } from "vitest";
import {
  WebmotorsStockClient,
  anuncioXml,
  defaultModalidade,
  describeReturnCode,
  isSuccessCode,
  ownReturnCode,
  pickColor,
  pickFuel,
  pickOptions,
  pickTransmission,
  xmlBlocks,
  xmlText,
  type Modalidade,
} from "./webmotors-stock";

const modalidade: Modalidade = {
  code: "5",
  name: "Destaque",
  adType: "U",
  total: 10,
  used: 3,
  priority: 1,
  allowsPhoto: true,
};

const codes = {
  modalidade,
  brand: "8",
  model: "120",
  version: "3345",
  transmission: { id: "1", name: "Manual" },
  color: { id: "4", name: "Prata" },
  fuel: { id: "2", name: "Gasolina e Álcool" },
  options: ["10", "22"],
};

const vehicle = {
  yearModel: 2020,
  yearManufacture: 2019,
  mileageKm: 45000,
  licensePlate: "abc-1d23",
  doors: 4,
  priceCents: 5590000,
  description: "Revisado & com manual <ok>",
};

/** Ordem da sequência do tipo Anuncio no WSDL do Webmotors. */
const WSDL_ORDER = [
  "CodigoAnuncio",
  "CodigoModalidade",
  "TipoAnuncio",
  "CodigoMarca",
  "CodigoModelo",
  "CodigoVersao",
  "AnoDoModelo",
  "AnoFabricacao",
  "Km",
  "Placa",
  "CodigoCambio",
  "DescricaoCambio",
  "NrPortas",
  "CodigoCor",
  "DescricaoCor",
  "CodigoCombustivel",
  "DescricaoCombustivel",
  "Blindado",
  "AdaptadoDeficientesFisicos",
  "UnicoDono",
  "Alienado",
  "IpvaPago",
  "NaoAceitaTroca",
  "RevisadoOficinaAgendaDoCarro",
  "RevisoesEmConcessionaria",
  "GarantiaDeFabrica",
  "Licenciado",
  "Leilao",
  "PrecoReal",
  "PrecoVenda",
  "Observacao",
  "DataInclusao",
  "DataUltimaAlteracao",
  "Opcional",
];

describe("anuncioXml", () => {
  it("emite os campos na ordem exata do WSDL (o XmlSerializer ignora o que vem fora)", () => {
    const xml = anuncioXml(vehicle, codes, null);
    const inner = xml
      .replace(/^<pAnuncio>|<\/pAnuncio>$/g, "")
      .replace(/<Opcional>[\s\S]*<\/Opcional>/, "<Opcional/>");
    const emitted = [...inner.matchAll(/<(\w+)[ />]/g)].map((match) => match[1]);
    const positions = emitted.map((name) => WSDL_ORDER.indexOf(name));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("leva os códigos do catálogo, preço com ponto e o texto escapado", () => {
    const xml = anuncioXml(vehicle, codes, null);
    expect(xml).toContain("<CodigoAnuncio>0</CodigoAnuncio>");
    expect(xml).toContain("<CodigoModalidade>5</CodigoModalidade><TipoAnuncio>U</TipoAnuncio>");
    expect(xml).toContain("<CodigoVersao>3345</CodigoVersao>");
    expect(xml).toContain("<Placa>ABC1D23</Placa>");
    expect(xml).toContain("<PrecoReal>55900.00</PrecoReal><PrecoVenda>55900.00</PrecoVenda>");
    expect(xml).toContain("Revisado &amp; com manual &lt;ok&gt;");
    expect(xml).toContain(
      "<Opcional><OpcionalWM><CodigoOpcional>10</CodigoOpcional></OpcionalWM><OpcionalWM><CodigoOpcional>22</CodigoOpcional></OpcionalWM></Opcional>",
    );
  });

  it("na alteração leva o código do anúncio", () => {
    expect(anuncioXml(vehicle, codes, "998877")).toContain("<CodigoAnuncio>998877</CodigoAnuncio>");
  });
});

describe("respostas do serviço", () => {
  it("lê blocos com e sem prefixo de namespace", () => {
    const xml =
      "<a:MarcaWM><CodigoMarca>8</CodigoMarca><NomeMarca>FIAT &amp; CIA</NomeMarca></a:MarcaWM>";
    const [block] = xmlBlocks(xml, "MarcaWM");
    expect(xmlText(block, "NomeMarca")).toBe("FIAT & CIA");
  });

  it("o CodigoRetorno do anúncio é o último, depois dos opcionais", () => {
    const xml =
      "<IncluirCarroResult><CodigoAnuncio>1</CodigoAnuncio><Opcional><OpcionalWM><CodigoRetorno>200</CodigoRetorno></OpcionalWM></Opcional><CodigoRetorno>400</CodigoRetorno></IncluirCarroResult>";
    expect(ownReturnCode(xml)).toBe("400");
  });

  it("códigos no estilo HTTP, como o serviço real devolve", () => {
    expect(isSuccessCode("200")).toBe(true);
    expect(isSuccessCode(null)).toBe(true);
    expect(isSuccessCode("400")).toBe(false);
    expect(describeReturnCode("401", "a inclusão")).toContain("Integração Revendedor");
  });
});

describe("tabelas do Webmotors", () => {
  const fuels = [
    { id: "1", name: "Gasolina" },
    { id: "2", name: "Gasolina e Álcool" },
    { id: "3", name: "Álcool" },
  ];
  const transmissions = [
    { id: "1", name: "Manual" },
    { id: "2", name: "Automática" },
  ];
  const colors = [
    { id: "1", name: "Preto" },
    { id: "4", name: "Prata" },
  ];

  it("flex é 'gasolina e álcool', não 'gasolina'", () => {
    expect(pickFuel("flex", fuels)?.id).toBe("2");
    expect(pickFuel("etanol", fuels)?.id).toBe("3");
  });

  it("CVT cai em automática quando o portal não tem CVT", () => {
    expect(pickTransmission("cvt", transmissions)?.id).toBe("2");
  });

  it("cor com acabamento casa pela cor", () => {
    expect(pickColor("Prata Metálico", colors)?.id).toBe("4");
    expect(pickColor("Champagne", colors)).toBeNull();
  });

  it("opcional sem par no portal fica de fora", () => {
    const table = [
      { id: "10", name: "Ar condicionado" },
      { id: "22", name: "Câmera de ré" },
    ];
    expect(pickOptions(["ar-condicionado", "ar-digital", "camera-re", "engate"], table)).toEqual([
      "10",
      "22",
    ]);
  });

  it("sem escolha da loja, usa a modalidade de maior cota com vaga (não gasta destaque)", () => {
    const list: Modalidade[] = [
      { ...modalidade, code: "1", name: "Padrão", total: 50, used: 50 },
      { ...modalidade, code: "2", name: "Destaque", total: 5, used: 0 },
      { ...modalidade, code: "3", name: "Básico", total: 30, used: 10 },
    ];
    expect(defaultModalidade(list)?.code).toBe("3");
  });
});

describe("WebmotorsStockClient.login", () => {
  it("manda o SOAP do autenticar e guarda o hash", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(
          "<soap:Envelope><soap:Body><autenticarResponse><autenticarResult><HashAutenticacao>abc</HashAutenticacao><CodigoRetorno>200</CodigoRetorno></autenticarResult></autenticarResponse></soap:Body></soap:Envelope>",
        ),
      );
    await WebmotorsStockClient.login(
      { cnpj: "12345678000190", email: "a@b.com", password: "x&y" },
      fetcher as unknown as typeof fetch,
    );
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://integracao.webmotors.com.br/wsLoginSistemaRevendedor.asmx");
    expect(init.headers.SOAPAction).toBe(
      '"www.webmotors.com.br/wsLoginSistemaRevendedor/autenticar"',
    );
    expect(init.body).toContain("<senha>x&amp;y</senha>");
  });

  it("recusa com a frase do serviço real ('Erro na Autenticacao', 400)", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(
          "<autenticarResult><HashAutenticacao>Erro na Autenticacao</HashAutenticacao><CodigoRetorno>400</CodigoRetorno></autenticarResult>",
        ),
      );
    await expect(
      WebmotorsStockClient.login(
        { cnpj: "1", email: "a", password: "b" },
        fetcher as unknown as typeof fetch,
      ),
    ).rejects.toMatchObject({ message: expect.stringContaining("Integração Revendedor") });
  });
});
