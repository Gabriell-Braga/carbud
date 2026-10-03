import type { Vehicle } from "@/db/schema";
import { ApiError } from "@/lib/http";
import { normalizeCatalogName, type CatalogEntry } from "./catalog-match";
import { escapeXml } from "./stock-feed";

/**
 * Webmotors: publicação de estoque pelo "Gestor de Estoque Terceiro".
 *
 * Não é a API REST do Sensedia (essa só tem leads e catálogo para outros
 * canais). Publicar carro no Webmotors por integrador é o web service SOAP
 * `wsEstoqueRevendedorWebMotors`, autenticado por um usuário de perfil
 * "Integração Revendedor" que a LOJA pede ao atendimento do Webmotors. É um
 * usuário diferente do "Integrador de API" dos leads, e não entra no Cockpit.
 *
 * O que o Webmotors cobra com rigor, e o que este módulo garante:
 *
 * - Marca, modelo, versão, cor, câmbio e combustível vão como CÓDIGOS do
 *   catálogo dele (ObterMarca, ObterModelo, ObterVersao, ObterCores…), nunca
 *   como texto. Código que não existe ou não combina com o resto é recusa.
 * - Os campos vão na ordem do WSDL. O serviço é ASMX (.NET XmlSerializer):
 *   elemento fora da sequência é ignorado em silêncio, e o anúncio sobe com
 *   o campo zerado.
 * - Todo anúncio vai numa "modalidade" — o tipo de anúncio do plano da loja
 *   (ex.: Padrão, Destaque, Super Destaque), com cota própria. ObterModalidade
 *   diz quais existem e quanto de cada uma já foi usado.
 * - O retorno não é HTTP: vem em `CodigoRetorno`, com códigos no estilo HTTP
 *   (conferido no serviço real: login errado devolve 400, hash inválido 401).
 *
 * WSDL: https://integracao.webmotors.com.br/wsEstoqueRevendedorWebMotors.asmx?WSDL
 * Login: https://integracao.webmotors.com.br/wsLoginSistemaRevendedor.asmx?WSDL
 */

const BASE = "https://integracao.webmotors.com.br";
const STOCK_NS = "www.webmotors.com.br/wsEstoqueRevendedorWebMotors";
const LOGIN_NS = "www.webmotors.com.br/wsLoginSistemaRevendedor";

/* ------------------------------------------------------------------------ */
/* XML mínimo                                                                */
/* ------------------------------------------------------------------------ */

/*
 * O Worker não tem DOMParser, e as respostas do serviço são planas: listas de
 * blocos com campos simples, sem atributos que importem. Duas funções cobrem
 * tudo o que lemos.
 */

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&");
}

/**
 * O CodigoRetorno do próprio anúncio. Os opcionais dentro dele também têm
 * um, e vêm ANTES na sequência; o do anúncio é o último.
 */
export function ownReturnCode(xml: string): string | null {
  const all = xmlBlocks(xml, "CodigoRetorno");
  const last = all[all.length - 1];
  return last === undefined ? null : decodeXml(last).trim() || null;
}

/** Conteúdo de cada `<tag>…</tag>` (sem prefixo de namespace), em ordem. */
export function xmlBlocks(xml: string, tag: string): string[] {
  const pattern = new RegExp(`<(?:\\w+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${tag}>`, "g");
  return [...xml.matchAll(pattern)].map((match) => match[1]);
}

/** Texto do primeiro `<tag>` do trecho; null quando falta ou é `xsi:nil`. */
export function xmlText(xml: string, tag: string): string | null {
  const block = xmlBlocks(xml, tag)[0];
  if (block === undefined) return null;
  const value = decodeXml(block).trim();
  return value === "" ? null : value;
}

function element(name: string, value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  return `<${name}>${escapeXml(String(value))}</${name}>`;
}

function envelope(namespace: string, operation: string, inner: string): string {
  return (
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
    'xmlns:xsd="http://www.w3.org/2001/XMLSchema" ' +
    'xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">' +
    `<soap:Body><${operation} xmlns="${namespace}">${inner}</${operation}></soap:Body>` +
    "</soap:Envelope>"
  );
}

/* ------------------------------------------------------------------------ */
/* CodigoRetorno                                                             */
/* ------------------------------------------------------------------------ */

/** Ausente ou 2xx: deu certo. O serviço às vezes nem preenche no sucesso. */
export function isSuccessCode(code: string | null): boolean {
  return !code || /^2\d\d$/.test(code.trim()) || code.trim() === "0";
}

/**
 * O código em português, dizendo onde mexer. Os números seguem o HTTP; o
 * texto é nosso, porque o serviço não manda mensagem nenhuma junto.
 */
export function describeReturnCode(code: string | null, action: string): string {
  const value = code?.trim() ?? "";
  const reason: Record<string, string> = {
    "400":
      "dados recusados (confira marca, modelo, versão, ano, cor, câmbio e combustível da ficha)",
    "401": "acesso negado (o usuário Integração Revendedor está ativo? a senha mudou?)",
    "403":
      "a loja não tem permissão para isso (plano Webmotors ativo? termo de adesão aceito no Cockpit?)",
    "404": "anúncio não encontrado no Webmotors",
    "409": "conflito com um anúncio que já existe no Webmotors",
    "412": "a modalidade escolhida está sem cota disponível",
    "500": "erro interno do Webmotors; tentamos de novo na próxima sincronização",
  };
  return `Webmotors recusou ${action}: ${reason[value] ?? `código ${value || "desconhecido"}`}.`;
}

/* ------------------------------------------------------------------------ */
/* Tabelas de referência                                                     */
/* ------------------------------------------------------------------------ */

export type Modalidade = {
  code: string;
  name: string;
  /** Repetido no anúncio (o serviço pede junto com o código). */
  adType: string | null;
  total: number;
  used: number;
  priority: number;
  allowsPhoto: boolean;
};

export type WebmotorsVersion = CatalogEntry & { years: number[] };

/** Cota livre da modalidade. Total zero com uso zero = sem limite informado. */
export function modalidadeFree(modalidade: Modalidade): number | null {
  if (modalidade.total <= 0) return null;
  return Math.max(0, modalidade.total - modalidade.used);
}

/**
 * A modalidade quando a loja não escolheu: a de maior cota que ainda tem
 * vaga. É a "padrão" do plano — destaque costuma vir em poucas unidades, e
 * gastar destaque sem a loja pedir é gastar dinheiro dela.
 */
export function defaultModalidade(list: Modalidade[]): Modalidade | null {
  const withRoom = list.filter((item) => {
    const free = modalidadeFree(item);
    return free === null || free > 0;
  });
  const pool = withRoom.length ? withRoom : list;
  return [...pool].sort((a, b) => b.total - a.total || a.priority - b.priority)[0] ?? null;
}

/** Combustível nosso → descrições que o Webmotors usa, na ordem de preferência. */
const FUEL_NAMES: Record<string, string[]> = {
  flex: ["gasolina e alcool", "flex", "alcool e gasolina", "gasolina e etanol", "bicombustivel"],
  gasolina: ["gasolina"],
  etanol: ["alcool", "etanol"],
  diesel: ["diesel"],
  gnv: ["gasolina e gas natural", "gas natural", "gnv", "gasolina alcool e gas natural"],
  hibrido: ["hibrido", "gasolina e eletrico", "hibrido gasolina"],
  eletrico: ["eletrico"],
};

const TRANSMISSION_NAMES: Record<string, string[]> = {
  manual: ["manual", "mecanico", "mecanica"],
  automatico: ["automatica", "automatico"],
  automatizado: ["automatizada", "automatizado", "semi automatica", "semiautomatica", "automatica"],
  cvt: ["cvt", "automatica cvt", "automatica"],
};

/** Primeiro nome da lista que existe na tabela; igualdade antes de prefixo. */
export function pickByNames(names: string[], table: CatalogEntry[]): CatalogEntry | null {
  const rows = table.map((row) => ({ row, name: normalizeCatalogName(row.name) }));
  for (const name of names) {
    const hit = rows.find((item) => item.name === name);
    if (hit) return hit.row;
  }
  for (const name of names) {
    const hit = rows.find((item) => item.name.startsWith(name));
    if (hit) return hit.row;
  }
  return null;
}

export function pickFuel(fuel: string | null, table: CatalogEntry[]): CatalogEntry | null {
  return fuel ? pickByNames(FUEL_NAMES[fuel] ?? [fuel], table) : null;
}

export function pickTransmission(value: string | null, table: CatalogEntry[]): CatalogEntry | null {
  return value ? pickByNames(TRANSMISSION_NAMES[value] ?? [value], table) : null;
}

/** Cor digitada livre ("preto metálico", "Branco Perolizado") → cor da tabela. */
export function pickColor(color: string | null, table: CatalogEntry[]): CatalogEntry | null {
  if (!color?.trim()) return null;
  const wanted = normalizeCatalogName(color);
  const exact = pickByNames([wanted], table);
  if (exact) return exact;
  // "preto metalico" → "preto": a primeira palavra é a cor, o resto é acabamento
  const first = wanted.split(" ")[0];
  return pickByNames([first], table);
}

/**
 * Opcionais nossos → nomes do Webmotors. Só os que existem na tabela do
 * portal entram; o que não casa fica de fora em vez de virar recusa.
 */
const OPTION_NAMES: Record<string, string[]> = {
  "ar-condicionado": ["ar condicionado"],
  "ar-digital": ["ar condicionado digital", "ar condicionado"],
  "direcao-hidraulica": ["direcao hidraulica"],
  "direcao-eletrica": ["direcao eletrica"],
  "vidros-eletricos": ["vidros eletricos"],
  "travas-eletricas": ["travas eletricas", "trava eletrica"],
  "banco-couro": ["bancos de couro", "banco de couro", "bancos em couro"],
  "teto-solar": ["teto solar"],
  "piloto-automatico": ["piloto automatico", "controle automatico de velocidade"],
  abs: ["freio abs", "freios abs", "abs"],
  airbag: ["airbag", "air bag", "airbag motorista"],
  "controle-tracao": ["controle de tracao"],
  "controle-estabilidade": ["controle de estabilidade"],
  "sensor-re": ["sensor de estacionamento", "sensor de re"],
  "camera-re": ["camera de re"],
  alarme: ["alarme"],
  multimidia: ["central multimidia", "som", "radio"],
  gps: ["navegador gps", "gps"],
  "computador-bordo": ["computador de bordo"],
  "farol-neblina": ["farol de neblina", "farois de neblina"],
  "rodas-liga": ["rodas de liga leve", "roda de liga leve"],
  "4x4": ["tracao 4x4", "4x4"],
  blindado: ["blindado"],
};

export function pickOptions(options: string[] | null, table: CatalogEntry[]): string[] {
  const codes = new Set<string>();
  for (const option of options ?? []) {
    const names = OPTION_NAMES[option];
    if (!names) continue;
    const hit = pickByNames(names, table);
    if (hit) codes.add(hit.id);
  }
  return [...codes];
}

/* ------------------------------------------------------------------------ */
/* Anúncio                                                                   */
/* ------------------------------------------------------------------------ */

export type WebmotorsAdCodes = {
  modalidade: Modalidade;
  brand: string;
  model: string;
  version: string;
  transmission: CatalogEntry;
  color: CatalogEntry;
  fuel: CatalogEntry;
  options: string[];
};

/** Reais com ponto e duas casas: é o `decimal` do XmlSerializer. */
function decimal(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * O `<pAnuncio>` de IncluirCarro e AlterarCarro.
 *
 * A ordem dos elementos é a do WSDL, e não é estética — ver o topo do
 * arquivo. Campos com minOccurs=1 vão sempre, mesmo zerados (CodigoAnuncio
 * zero na inclusão). Os "S/N" opcionais (blindado, único dono, IPVA…) ficam
 * de fora: não temos o dado na ficha, e mandar "não" seria afirmar o que a
 * loja não disse.
 */
export function anuncioXml(
  vehicle: Pick<
    Vehicle,
    | "yearModel"
    | "yearManufacture"
    | "mileageKm"
    | "licensePlate"
    | "doors"
    | "priceCents"
    | "description"
  >,
  codes: WebmotorsAdCodes,
  adCode: string | null,
): string {
  const options = codes.options
    .map((code) => `<OpcionalWM><CodigoOpcional>${escapeXml(code)}</CodigoOpcional></OpcionalWM>`)
    .join("");

  return (
    "<pAnuncio>" +
    element("CodigoAnuncio", adCode ?? "0") +
    element("CodigoModalidade", codes.modalidade.code) +
    element("TipoAnuncio", codes.modalidade.adType) +
    element("CodigoMarca", codes.brand) +
    element("CodigoModelo", codes.model) +
    element("CodigoVersao", codes.version) +
    element("AnoDoModelo", vehicle.yearModel) +
    element("AnoFabricacao", vehicle.yearManufacture) +
    element("Km", Math.max(0, Math.round(vehicle.mileageKm))) +
    element("Placa", vehicle.licensePlate?.replace(/[^a-z0-9]/gi, "").toUpperCase() ?? null) +
    element("CodigoCambio", codes.transmission.id) +
    element("NrPortas", vehicle.doors ?? 0) +
    element("CodigoCor", codes.color.id) +
    element("CodigoCombustivel", codes.fuel.id) +
    // preço real e de venda iguais: não há "de/por" no nosso cadastro
    element("PrecoReal", decimal(vehicle.priceCents)) +
    element("PrecoVenda", decimal(vehicle.priceCents)) +
    element("Observacao", vehicle.description?.trim().slice(0, 4000) || null) +
    (options ? `<Opcional>${options}</Opcional>` : "") +
    "</pAnuncio>"
  );
}

/* ------------------------------------------------------------------------ */
/* Cliente                                                                   */
/* ------------------------------------------------------------------------ */

export type StockLogin = { cnpj: string; email: string; password: string };

export class WebmotorsStockClient {
  constructor(
    private readonly hash: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  /**
   * Hash da sessão. O mesmo login serve para a sincronização inteira; o
   * serviço devolve a frase "Erro na Autenticacao" no lugar do hash quando
   * recusa, junto do código 400.
   */
  static async login(
    login: StockLogin,
    fetcher: typeof fetch = fetch,
  ): Promise<WebmotorsStockClient> {
    const xml = await soap(
      fetcher,
      "wsLoginSistemaRevendedor.asmx",
      LOGIN_NS,
      "autenticar",
      element("cnpj", login.cnpj) +
        element("email", login.email) +
        element("senha", login.password),
    );
    const code = xmlText(xml, "CodigoRetorno");
    const hash = xmlText(xml, "HashAutenticacao");
    if (!isSuccessCode(code) || !hash || /erro/i.test(hash)) {
      throw new ApiError(
        400,
        'O Webmotors recusou o login do estoque. Confira o CNPJ e o e-mail e a senha do usuário "Integração Revendedor" (é outro usuário, diferente do Integrador de API dos leads).',
      );
    }
    return new WebmotorsStockClient(hash, fetcher);
  }

  private call(operation: string, inner = ""): Promise<string> {
    return soap(
      this.fetcher,
      "wsEstoqueRevendedorWebMotors.asmx",
      STOCK_NS,
      operation,
      element("pHashAutenticacao", this.hash) + inner,
    );
  }

  /** Lista de referência; o primeiro item com código de erro vira exceção. */
  private async list(
    operation: string,
    itemTag: string,
    idTag: string,
    nameTag: string,
    inner = "",
  ): Promise<CatalogEntry[]> {
    const xml = await this.call(operation, inner);
    const rows = xmlBlocks(xml, itemTag);
    const code = rows[0] ? xmlText(rows[0], "CodigoRetorno") : null;
    if (!isSuccessCode(code))
      throw new ApiError(502, describeReturnCode(code, `a consulta ${operation}`));
    return rows
      .map((row) => ({ id: xmlText(row, idTag) ?? "", name: xmlText(row, nameTag) ?? "" }))
      .filter((row) => row.id && row.id !== "0" && row.name);
  }

  brands() {
    return this.list("ObterMarca", "MarcaWM", "CodigoMarca", "NomeMarca");
  }

  models(brandCode: string) {
    return this.list(
      "ObterModelo",
      "ModeloWM",
      "CodigoModelo",
      "NomeModelo",
      element("pCodigoMarca", brandCode),
    );
  }

  /** O intervalo de datas filtra por atualização; aberto, vem a lista inteira. */
  async versions(modelCode: string): Promise<WebmotorsVersion[]> {
    const xml = await this.call(
      "ObterVersao",
      element("pCodigoModelo", modelCode) +
        element("pDataInicioAtualizacao", "1900-01-01T00:00:00") +
        element("pDataFimAtualizacao", new Date().toISOString().slice(0, 19)),
    );
    const rows = xmlBlocks(xml, "Versao");
    const code = rows[0] ? xmlText(rows[0], "CodigoRetorno") : null;
    if (!isSuccessCode(code))
      throw new ApiError(502, describeReturnCode(code, "a consulta de versões"));
    return rows
      .map((row) => ({
        id: xmlText(row, "CodigoVersao") ?? "",
        name: xmlText(row, "NomeVersao") ?? "",
        // <AnoModelo><AnoModeloWM><AnoModelo>2020</AnoModelo></AnoModeloWM></AnoModelo>
        years: xmlBlocks(row, "AnoModeloWM")
          .map((block) => Number(xmlText(block, "AnoModelo")))
          .filter((year) => Number.isFinite(year) && year > 1900),
      }))
      .filter((row) => row.id && row.id !== "0" && row.name);
  }

  colors() {
    return this.list("ObterCores", "CorWM", "CodigoCor", "Descricao");
  }

  fuels() {
    return this.list("ObterCombustivel", "CombustivelWM", "CodigoCombustivel", "Descricao");
  }

  transmissions() {
    return this.list("ObterCambio", "TipoCambioWM", "CodigoCambio", "Descricao");
  }

  optionsTable() {
    return this.list("ObterOpcionais", "OpcionalWM", "CodigoOpcional", "Descricao");
  }

  /** Tipos de anúncio do plano da loja, com a cota usada de cada um. */
  async modalidades(): Promise<Modalidade[]> {
    const xml = await this.call("ObterModalidade");
    const rows = xmlBlocks(xml, "ModalidadeWM");
    const code = rows[0] ? xmlText(rows[0], "CodigoRetorno") : null;
    if (!isSuccessCode(code))
      throw new ApiError(502, describeReturnCode(code, "a consulta de modalidades"));
    return rows
      .map((row) => ({
        code: xmlText(row, "CodigoModalidade") ?? "",
        name: xmlText(row, "Descricao") ?? "",
        adType: xmlText(row, "TipoAnuncio"),
        total: Number(xmlText(row, "QuantidadeAnunciosTotal") ?? 0),
        used: Number(xmlText(row, "QuantidadeAnuncios") ?? 0),
        priority: Number(xmlText(row, "Prioridade") ?? 0),
        allowsPhoto: !/^n/i.test(xmlText(row, "PermiteFoto") ?? "S"),
      }))
      .filter((row) => row.code && row.code !== "0");
  }

  private async anuncio(operation: string, inner: string, action: string): Promise<string> {
    const xml = await this.call(operation, inner);
    const code = ownReturnCode(xml);
    if (!isSuccessCode(code)) throw new ApiError(400, describeReturnCode(code, action));
    return xml;
  }

  /** Devolve o código do anúncio criado; zero ou vazio é falha. */
  async create(anuncio: string): Promise<string> {
    const xml = await this.anuncio("IncluirCarro", anuncio, "a inclusão do anúncio");
    const id = xmlText(xml, "CodigoAnuncio");
    if (!id || Number(id) <= 0) {
      throw new ApiError(502, describeReturnCode(ownReturnCode(xml), "a inclusão do anúncio"));
    }
    return String(Math.trunc(Number(id)));
  }

  async update(anuncio: string): Promise<void> {
    await this.anuncio("AlterarCarro", anuncio, "a alteração do anúncio");
  }

  /** Já removido do lado deles conta como removido: o objetivo foi atingido. */
  async remove(adCode: string, reason: string): Promise<void> {
    const xml = await this.call(
      "ExcluirCarro",
      element("pCodigoAnuncio", adCode) + element("pMotivoExclusao", reason),
    );
    const code = ownReturnCode(xml);
    if (isSuccessCode(code) || code?.trim() === "404") return;
    throw new ApiError(502, describeReturnCode(code, "a exclusão do anúncio"));
  }

  async changeModalidade(adCode: string, modalidadeCode: string): Promise<void> {
    const xml = await this.call(
      "TrocarModalidadeCarro",
      element("pCodigoAnuncio", adCode) + element("pCodigoModalidade", modalidadeCode),
    );
    const code = xmlText(xml, "CodigoRetorno");
    if (!isSuccessCode(code))
      throw new ApiError(400, describeReturnCode(code, "a troca do tipo de anúncio"));
  }

  async photos(adCode: string): Promise<string[]> {
    const xml = await this.call("ObterFotosCarro", element("pCodigoAnuncio", adCode));
    return xmlBlocks(xml, "DetalheFotoWM")
      .map((row) => xmlText(row, "CodigoFotoAnuncio") ?? "")
      .filter((id) => id && id !== "0");
  }

  async removePhoto(adCode: string, photoCode: string): Promise<void> {
    await this.call(
      "ExcluirFoto",
      element("pCodigoFoto", photoCode) + element("pCodigoAnuncio", adCode),
    );
  }

  /** O Webmotors baixa a foto da URL; ela precisa ser pública. */
  async addPhoto(adCode: string, url: string): Promise<void> {
    const xml = await this.call(
      "IncluirFotoUrl",
      element("oUrlImagem", url) + element("pCodigoAnuncio", adCode),
    );
    const code = xmlText(xml, "CodigoRetorno");
    if (!isSuccessCode(code)) throw new ApiError(502, describeReturnCode(code, "uma das fotos"));
  }
}

async function soap(
  fetcher: typeof fetch,
  service: string,
  namespace: string,
  operation: string,
  inner: string,
): Promise<string> {
  let response: Response;
  try {
    response = await fetcher(`${BASE}/${service}`, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: `"${namespace}/${operation}"`,
      },
      body: envelope(namespace, operation, inner),
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    throw new ApiError(
      502,
      "O Webmotors não respondeu. Tentamos de novo na próxima sincronização.",
    );
  }
  const text = await response.text();
  if (!response.ok) {
    const fault = xmlText(text, "faultstring");
    throw new ApiError(
      502,
      fault
        ? `O Webmotors devolveu um erro em ${operation}: ${fault.slice(0, 200)}`
        : `O Webmotors respondeu HTTP ${response.status} em ${operation}.`,
    );
  }
  return text;
}
