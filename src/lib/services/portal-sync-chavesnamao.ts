import type { PortalConnection, Vehicle } from "@/db/schema";
import { cached } from "@/lib/cache";
import { ApiError } from "@/lib/http";
import {
  matchBrand,
  matchModel,
  matchVersion,
  noMatchMessage,
  type CatalogEntry,
} from "@/lib/integrations/catalog-match";
import { ChavesNaMaoClient, vehiclePayload, type CnmCodes } from "@/lib/integrations/chavesnamao";
import { shouldBePublished } from "@/lib/integrations/portals";
import { pickOptions } from "@/lib/integrations/webmotors-stock";
import { readCredentials } from "./portals";
import {
  emptyReport,
  failConnection,
  failPublication,
  finishConnection,
  loadVehicle,
  pictureUrls,
  publicationQueue,
  savePublication,
  type SyncReport,
} from "./portal-sync-shared";

/**
 * Publicação de estoque no Chaves na Mão. O protocolo está em
 * `chavesnamao.ts`; aqui é a fila: quem sobe, quem muda, quem sai.
 *
 * A referência do anúncio lá é o id do carro aqui, então o externalId só
 * marca que o carro já foi criado no portal.
 */

/** O catálogo é o mesmo para todas as lojas; muda devagar. */
const CATALOG_TTL = 24 * 60 * 60;

export async function openChavesNaMao(connection: PortalConnection): Promise<ChavesNaMaoClient> {
  const secrets = await readCredentials(connection);
  if (!secrets.token)
    throw new ApiError(401, "Conexão sem o token de integração. Conecte de novo.");
  return ChavesNaMaoClient.open(secrets.token);
}

export async function syncChavesNaMao(
  connection: PortalConnection,
  origin: string,
): Promise<SyncReport> {
  const report = emptyReport("chavesnamao");
  const queue = await publicationQueue(connection.tenantId, "chavesnamao");
  if (queue.length === 0) {
    await finishConnection(connection);
    return report;
  }

  let client: ChavesNaMaoClient;
  let plan: { adsAvailable: number };
  try {
    client = await openChavesNaMao(connection);
    plan = await client.plan();
  } catch (error) {
    return { ...report, error: await failConnection(connection, error) };
  }

  const catalog = (name: string, loader: () => Promise<CatalogEntry[]>) =>
    cached(`portal:chavesnamao:${name}`, CATALOG_TTL, loader);

  for (const publication of queue) {
    try {
      const vehicle = await loadVehicle(publication.vehicleId);
      if (!vehicle) throw new ApiError(404, "Veículo não existe mais.");

      // "erro" não diz para que lado estava indo; a situação do carro diz
      const removing =
        publication.status === "removendo" ||
        (publication.status === "erro" && !shouldBePublished(vehicle.status));
      if (removing) {
        if (publication.externalId) {
          await client.remove(vehicle.id);
          plan.adsAvailable += 1;
        }
        await savePublication(publication, {
          status: "removido",
          externalId: null,
          lastError: null,
        });
        report.removed += 1;
        continue;
      }

      const payload = vehiclePayload(
        vehicle,
        await resolveCodes(client, catalog, vehicle),
        await pictureUrls(vehicle.id, origin),
      );

      if (publication.externalId && (await client.update(payload))) {
        await savePublication(publication, { status: "publicado", lastError: null });
        report.updated += 1;
        continue;
      }

      /*
       * Criar sem vaga deixa o carro cadastrado lá e fora do ar, e a tela
       * mostraria "publicado". Melhor dizer agora o que falta.
       */
      if (plan.adsAvailable <= 0) {
        throw new ApiError(
          409,
          "O plano do Chaves na Mão está sem vagas de anúncio. Libere um anúncio ou amplie o plano.",
        );
      }
      await client.create(payload);
      plan.adsAvailable -= 1;
      await savePublication(publication, {
        status: "publicado",
        externalId: vehicle.id,
        lastError: null,
      });
      report.published += 1;
    } catch (error) {
      // token recusado no meio da fila: os próximos carros falhariam igual
      if (error instanceof ApiError && error.status === 401) {
        return { ...report, error: await failConnection(connection, error) };
      }
      report.failed += 1;
      await failPublication(publication, error);
    }
  }

  await finishConnection(connection);
  return report;
}

async function resolveCodes(
  client: ChavesNaMaoClient,
  catalog: (name: string, loader: () => Promise<CatalogEntry[]>) => Promise<CatalogEntry[]>,
  vehicle: Vehicle,
): Promise<CnmCodes> {
  const portal = "O Chaves na Mão";
  const brand = matchBrand(vehicle.brand, await catalog("marcas", () => client.brands()));
  if (!brand.ok) {
    throw new ApiError(400, noMatchMessage(portal, "marca", vehicle.brand, brand.suggestions));
  }

  const model = matchModel(
    vehicle.model,
    await catalog(`modelos:${brand.entry.id}`, () => client.models(brand.entry.id)),
  );
  if (!model.ok) {
    throw new ApiError(400, noMatchMessage(portal, "modelo", vehicle.model, model.suggestions));
  }

  const trim = matchVersion(
    vehicle.version,
    await catalog(`versoes:${model.entry.id}`, () => client.trims(model.entry.id)),
  );
  if (!trim.ok) {
    throw new ApiError(400, noMatchMessage(portal, "versão", vehicle.version, trim.suggestions));
  }

  const accessories = await catalog("acessorios", () => client.accessories());
  return {
    trimId: Number(trim.entry.id),
    accessories: pickOptions(vehicle.options, accessories).map(Number),
  };
}

/** Remove os anúncios de carros que vão ser apagados aqui. */
export async function closeChavesNaMaoAds(connection: PortalConnection, references: string[]) {
  const client = await openChavesNaMao(connection);
  for (const reference of references) await client.remove(reference);
}
