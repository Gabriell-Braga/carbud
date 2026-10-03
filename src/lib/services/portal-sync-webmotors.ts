import type { PortalConnection, Vehicle, VehiclePublication } from "@/db/schema";
import { cached } from "@/lib/cache";
import { ApiError } from "@/lib/http";
import {
  matchBrand,
  matchModel,
  matchVersion,
  noMatchMessage,
  type CatalogEntry,
} from "@/lib/integrations/catalog-match";
import { shouldBePublished } from "@/lib/integrations/portals";
import {
  WebmotorsStockClient,
  anuncioXml,
  defaultModalidade,
  modalidadeFree,
  pickColor,
  pickFuel,
  pickOptions,
  pickTransmission,
  type Modalidade,
  type WebmotorsAdCodes,
} from "@/lib/integrations/webmotors-stock";
import { getConnection, readCredentials } from "./portals";
import {
  emptyReport,
  failConnection,
  failPublication,
  fingerprint,
  loadVehicle,
  pictureUrls,
  publicationQueue,
  savePublication,
  type SyncReport,
} from "./portal-sync-shared";

/**
 * Publicação de estoque no Webmotors (SOAP do gestor de estoque terceiro).
 * O protocolo e as regras do portal estão em `webmotors-stock.ts`; aqui é a
 * fila: quem sobe, quem muda, quem sai.
 */

/** O catálogo do Webmotors é o mesmo para todas as lojas; muda devagar. */
const CATALOG_TTL = 24 * 60 * 60;

type WmSettings = { cnpj?: string; stockEmail?: string; listingTypeId?: string };

/** Abre a sessão do estoque com o usuário "Integração Revendedor" da loja. */
export async function openWebmotorsStock(
  connection: PortalConnection,
): Promise<WebmotorsStockClient> {
  const settings = (connection.settings ?? {}) as WmSettings;
  const secrets = await readCredentials(connection);
  if (!settings.cnpj || !settings.stockEmail || !secrets.stockPassword) {
    throw new ApiError(409, "O estoque do Webmotors não está configurado nesta conexão.");
  }
  try {
    return await WebmotorsStockClient.login({
      cnpj: settings.cnpj,
      email: settings.stockEmail,
      password: secrets.stockPassword,
    });
  } catch (error) {
    // senha trocada no Webmotors: só reconectar resolve
    if (error instanceof ApiError && error.status === 400) throw new ApiError(401, error.message);
    throw error;
  }
}

/** Tabelas que não dependem do carro, carregadas uma vez por passada. */
class Tables {
  private colors?: Promise<CatalogEntry[]>;
  private fuels?: Promise<CatalogEntry[]>;
  private transmissions?: Promise<CatalogEntry[]>;
  private options?: Promise<CatalogEntry[]>;
  private brands?: Promise<CatalogEntry[]>;

  constructor(private readonly client: WebmotorsStockClient) {}

  private table(name: string, loader: () => Promise<CatalogEntry[]>) {
    return cached(`portal:webmotors:${name}`, CATALOG_TTL, loader);
  }

  getColors = () => (this.colors ??= this.table("cores", () => this.client.colors()));
  getFuels = () => (this.fuels ??= this.table("combustiveis", () => this.client.fuels()));
  getTransmissions = () =>
    (this.transmissions ??= this.table("cambios", () => this.client.transmissions()));
  getOptions = () => (this.options ??= this.table("opcionais", () => this.client.optionsTable()));
  getBrands = () => (this.brands ??= this.table("marcas", () => this.client.brands()));
  getModels = (brand: string) => this.table(`modelos:${brand}`, () => this.client.models(brand));
  getVersions = (model: string) =>
    cached(`portal:webmotors:versoes:${model}`, CATALOG_TTL, () => this.client.versions(model));
}

export async function syncWebmotorsStock(
  connection: PortalConnection,
  origin: string,
): Promise<SyncReport> {
  const report = emptyReport("webmotors");
  const queue = await publicationQueue(connection.tenantId, "webmotors");
  if (queue.length === 0) return report;

  let client: WebmotorsStockClient;
  let modalidades: Modalidade[];
  try {
    client = await openWebmotorsStock(connection);
    modalidades = await client.modalidades();
  } catch (error) {
    return { ...report, error: await failConnection(connection, error) };
  }
  if (modalidades.length === 0) {
    return {
      ...report,
      error: await failConnection(
        connection,
        new ApiError(
          409,
          "A loja não tem nenhum tipo de anúncio no plano Webmotors. Confira o plano contratado.",
        ),
      ),
    };
  }

  const tables = new Tables(client);
  const settings = (connection.settings ?? {}) as WmSettings;

  for (const publication of queue) {
    try {
      const outcome = await processPublication(
        client,
        tables,
        modalidades,
        settings,
        publication,
        origin,
      );
      report[outcome] += 1;
    } catch (error) {
      report.failed += 1;
      await failPublication(publication, error);
    }
  }
  return report;
}

type Outcome = "published" | "updated" | "removed";

async function processPublication(
  client: WebmotorsStockClient,
  tables: Tables,
  modalidades: Modalidade[],
  settings: WmSettings,
  publication: VehiclePublication,
  origin: string,
): Promise<Outcome> {
  const vehicle = await loadVehicle(publication.vehicleId);
  if (!vehicle) throw new ApiError(404, "Veículo não existe mais.");

  const removing =
    publication.status === "removendo" ||
    (publication.status === "erro" && !shouldBePublished(vehicle.status));
  if (removing) {
    if (publication.externalId) {
      const freed = modalidades.find((item) => item.code === publication.meta?.appliedListingType);
      if (freed) freed.used = Math.max(0, freed.used - 1);
      await client.remove(
        publication.externalId,
        vehicle.status === "sold" ? "Vendido" : "Retirado do estoque",
      );
    }
    await savePublication(publication, { status: "removido", lastError: null });
    return "removed";
  }

  if (vehicle.priceOnRequest || vehicle.priceCents <= 0) {
    throw new ApiError(400, "O Webmotors exige preço; este veículo está como 'sob consulta'.");
  }
  if (!vehicle.doors) {
    throw new ApiError(400, "O Webmotors exige o número de portas. Preencha na ficha do veículo.");
  }

  const modalidade = chooseModalidade(modalidades, publication, settings);
  const codes = await resolveCodes(tables, vehicle, modalidade);
  const photos = await pictureUrls(vehicle.id, origin);

  let adCode = publication.externalId;
  let outcome: Outcome;
  if (adCode) {
    const applied = publication.meta?.appliedListingType;
    // trocar a modalidade é uma operação própria; AlterarCarro não muda o tipo
    if (applied && applied !== modalidade.code) {
      await client.changeModalidade(adCode, modalidade.code);
      // a cota é lida uma vez por passada: conta aqui para o próximo carro ver a vaga certa
      modalidade.used += 1;
      const previous = modalidades.find((item) => item.code === applied);
      if (previous) previous.used = Math.max(0, previous.used - 1);
    }
    await client.update(anuncioXml(vehicle, codes, adCode));
    outcome = "updated";
  } else {
    adCode = await client.create(anuncioXml(vehicle, codes, null));
    modalidade.used += 1;
    // grava o código já: se as fotos falharem, a próxima passada edita em vez de duplicar
    await savePublication(publication, {
      externalId: adCode,
      meta: { appliedListingType: modalidade.code },
    });
    outcome = "published";
  }

  const photosKey = await fingerprint(photos);
  let photosNote: string | null = null;
  if (modalidade.allowsPhoto && photos.length && photosKey !== publication.meta?.photosKey) {
    photosNote = await sendPhotos(client, adCode, photos, outcome === "updated");
  }

  await savePublication(publication, {
    status: "publicado",
    externalId: adCode,
    lastError: photosNote,
    meta: {
      appliedListingType: modalidade.code,
      ...(photosNote ? {} : { photosKey }),
    },
  });
  return outcome;
}

/**
 * O tipo pedido para o carro, senão o que o anúncio já tem, senão o padrão
 * da loja, senão o de maior cota.
 * Tipo que sumiu do plano é erro, não troca silenciosa: a loja pagou por um
 * destaque e precisa saber que ele não foi aplicado.
 */
export function chooseModalidade(
  modalidades: Modalidade[],
  publication: Pick<VehiclePublication, "meta">,
  settings: WmSettings,
): Modalidade {
  // anúncio no ar fica no tipo que tem: trocar o padrão vale para os novos
  const applied = modalidades.find((item) => item.code === publication.meta?.appliedListingType);
  const wanted = publication.meta?.listingType ?? applied?.code ?? settings.listingTypeId;
  if (wanted) {
    const hit = modalidades.find((item) => item.code === wanted);
    if (!hit) {
      throw new ApiError(
        409,
        "O tipo de anúncio escolhido não existe mais no plano Webmotors da loja. Escolha outro em Portais → Webmotors.",
      );
    }
    const free = modalidadeFree(hit);
    const alreadyThere = publication.meta?.appliedListingType === hit.code;
    if (free === 0 && !alreadyThere) {
      throw new ApiError(
        409,
        `O tipo "${hit.name}" está sem cota no plano (${hit.used} de ${hit.total} em uso). Escolha outro tipo ou libere um anúncio.`,
      );
    }
    return hit;
  }
  return defaultModalidade(modalidades)!;
}

async function resolveCodes(
  tables: Tables,
  vehicle: Vehicle,
  modalidade: Modalidade,
): Promise<WebmotorsAdCodes> {
  const brand = matchBrand(vehicle.brand, await tables.getBrands());
  if (!brand.ok)
    throw new ApiError(
      400,
      noMatchMessage("O Webmotors", "marca", vehicle.brand, brand.suggestions),
    );

  const model = matchModel(vehicle.model, await tables.getModels(brand.entry.id));
  if (!model.ok)
    throw new ApiError(
      400,
      noMatchMessage("O Webmotors", "modelo", vehicle.model, model.suggestions),
    );

  // a versão precisa existir NO ANO-MODELO do carro, não só no modelo
  const versions = await tables.getVersions(model.entry.id);
  const ofYear = versions.filter(
    (version) => version.years.length === 0 || version.years.includes(vehicle.yearModel),
  );
  const version = matchVersion(vehicle.version, ofYear.length ? ofYear : versions);
  if (!version.ok) {
    throw new ApiError(
      400,
      noMatchMessage("O Webmotors", "versão", vehicle.version, version.suggestions) +
        (ofYear.length === 0
          ? ` Nenhuma versão do ${model.entry.name} está listada para ${vehicle.yearModel}.`
          : ""),
    );
  }

  const [colors, fuels, transmissions, optionsTable] = await Promise.all([
    tables.getColors(),
    tables.getFuels(),
    tables.getTransmissions(),
    tables.getOptions(),
  ]);

  const color = pickColor(vehicle.color, colors);
  if (!color) {
    throw new ApiError(
      400,
      `O Webmotors não reconhece a cor "${vehicle.color ?? ""}". Use uma destas: ${colors.map((item) => item.name).join(", ")}.`,
    );
  }
  const fuel = pickFuel(vehicle.fuel, fuels);
  if (!fuel)
    throw new ApiError(400, "O Webmotors exige o combustível. Preencha na ficha do veículo.");
  const transmission = pickTransmission(vehicle.transmission, transmissions);
  if (!transmission)
    throw new ApiError(400, "O Webmotors exige o câmbio. Preencha na ficha do veículo.");

  return {
    modalidade,
    brand: brand.entry.id,
    model: model.entry.id,
    version: version.entry.id,
    transmission,
    color,
    fuel,
    options: pickOptions(vehicle.options, optionsTable),
  };
}

/**
 * Troca as fotos do anúncio pelas atuais. Não há "reordenar" no serviço:
 * sai tudo e entra de novo, capa primeiro. Falha numa foto não derruba o
 * anúncio — vira nota, e a próxima passada tenta de novo.
 */
async function sendPhotos(
  client: WebmotorsStockClient,
  adCode: string,
  photos: string[],
  replacing: boolean,
): Promise<string | null> {
  try {
    if (replacing) {
      for (const photo of await client.photos(adCode)) await client.removePhoto(adCode, photo);
    }
    for (const url of photos.slice(0, 20)) await client.addPhoto(adCode, url);
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `Anúncio no ar, mas as fotos não foram todas: ${message}`;
  }
}

/* ------------------------------------------------------------------------ */
/* Tipos de anúncio, para a tela                                             */
/* ------------------------------------------------------------------------ */

export async function webmotorsModalidades(tenantId: string): Promise<Modalidade[] | null> {
  const connection = await getConnection(tenantId, "webmotors");
  if (!connection || connection.status !== "conectado" || !connection.settings?.stockEmail) {
    return null;
  }
  const client = await openWebmotorsStock(connection);
  return client.modalidades();
}

/** Remove os anúncios de um carro que vai ser apagado. */
export async function closeWebmotorsAds(connection: PortalConnection, adCodes: string[]) {
  const client = await openWebmotorsStock(connection);
  for (const code of adCodes) await client.remove(code, "Retirado do estoque");
}
