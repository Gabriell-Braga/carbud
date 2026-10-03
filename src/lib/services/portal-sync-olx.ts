import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  portalConnections,
  vehiclePublications,
  type PortalConnection,
  type VehiclePublication,
} from "@/db/schema";
import { cached } from "@/lib/cache";
import { ApiError, badRequest } from "@/lib/http";
import {
  matchBrand,
  matchModel,
  matchVersion,
  noMatchMessage,
} from "@/lib/integrations/catalog-match";
import {
  OlxClient,
  describeImportStatus,
  describeProcessing,
  describeValidation,
  isAccepted,
  olxAd,
  type OlxAd,
  type OlxBalance,
  type OlxCatalogIds,
} from "@/lib/integrations/olx";
import { leadInboxToken } from "@/lib/integrations/portal-lead-inbox";
import type { OauthTokens } from "@/lib/integrations/portal-oauth";
import { shouldBePublished } from "@/lib/integrations/portals";
import { withBasePath } from "@/lib/paths";
import { getConnection, readCredentials } from "./portals";
import {
  emptyReport,
  failConnection,
  failPublication,
  finishConnection,
  loadVehicle,
  pictureUrls,
  publicationQueue,
  savePublication,
  sellerInfo,
  type SyncReport,
} from "./portal-sync-shared";

/**
 * Publicação na OLX. As regras do portal estão em `olx.ts`; aqui é a fila.
 *
 * A OLX trabalha em lote e responde em dois tempos: o lote é validado na
 * hora, e a moderação decide depois. Por isso um carro enviado fica
 * "publicado" com a nota "em análise" até a consulta seguinte confirmar o
 * anúncio no ar (com URL) ou trazer a recusa.
 */

const CATALOG_TTL = 24 * 60 * 60;
/** Bem abaixo de 1 MB por lote, com folga para descrição longa. */
const BATCH_SIZE = 40;

const REVIEW_NOTE = "Enviado. Aguardando a moderação da OLX.";

type OlxSettings = { leadConfigId?: string; leadConfigError?: string };

export async function openOlx(connection: PortalConnection): Promise<OlxClient> {
  const tokens = (await readCredentials(connection)) as OauthTokens;
  if (!tokens.accessToken) throw new ApiError(401, "Conexão da OLX sem acesso. Conecte de novo.");
  return new OlxClient(tokens.accessToken);
}

export async function syncOlx(connection: PortalConnection, origin: string): Promise<SyncReport> {
  const report = emptyReport("olx");
  let client: OlxClient;
  try {
    client = await openOlx(connection);
  } catch (error) {
    return { ...report, error: await failConnection(connection, error) };
  }

  const settings = { ...((connection.settings ?? {}) as OlxSettings) };
  try {
    await checkReviews(client, connection.tenantId);

    const queue = await publicationQueue(connection.tenantId, "olx");
    if (queue.length) await sendQueue(client, queue, origin, report);

    // a URL de leads é configurada na conexão; se falhou lá, tenta de novo aqui
    if (!settings.leadConfigId)
      await configureOlxLeads(client, connection.tenantId, origin, settings);
  } catch (error) {
    return { ...report, error: await failConnection(connection, error) };
  }

  await finishConnection(connection, settings);
  return report;
}

/* ------------------------------------------------------------------------ */
/* Envio                                                                     */
/* ------------------------------------------------------------------------ */

type Pending = { publication: VehiclePublication; ad: OlxAd | { id: string; operation: "delete" } };

async function sendQueue(
  client: OlxClient,
  queue: VehiclePublication[],
  origin: string,
  report: SyncReport,
): Promise<void> {
  const catalog = new Catalog(client);
  const pending: Pending[] = [];

  for (const publication of queue) {
    try {
      const vehicle = await loadVehicle(publication.vehicleId);
      if (!vehicle) throw new ApiError(404, "Veículo não existe mais.");

      const removing =
        publication.status === "removendo" ||
        (publication.status === "erro" && !shouldBePublished(vehicle.status));
      if (removing) {
        if (!publication.externalId) {
          await savePublication(publication, { status: "removido", lastError: null });
          report.removed += 1;
          continue;
        }
        pending.push({ publication, ad: { id: publication.externalId, operation: "delete" } });
        continue;
      }

      const seller = await sellerInfo(vehicle);
      const ad = olxAd({
        vehicle,
        pictureUrls: await pictureUrls(vehicle.id, origin),
        phone: seller.whatsapp,
        zip: seller.zip,
        catalog: await catalog.resolve(vehicle.brand, vehicle.model, vehicle.version),
      });
      pending.push({ publication, ad });
    } catch (error) {
      report.failed += 1;
      await failPublication(publication, error);
    }
  }

  for (let start = 0; start < pending.length; start += BATCH_SIZE) {
    await sendBatch(client, pending.slice(start, start + BATCH_SIZE), report);
  }
}

/**
 * Um lote. Se a OLX recusar algum anúncio na validação, ela cancela o lote
 * todo e diz quais: os recusados viram erro e o resto vai de novo, uma vez.
 */
async function sendBatch(client: OlxClient, batch: Pending[], report: SyncReport, retry = true) {
  if (batch.length === 0) return;
  const response = await client.importAds(batch.map((item) => item.ad));

  if (response.statusCode === 0) {
    for (const { publication, ad } of batch) {
      if (ad.operation === "delete") {
        await savePublication(publication, {
          status: "removido",
          lastError: null,
          meta: { importToken: response.token ?? undefined },
        });
        report.removed += 1;
        continue;
      }
      const isNew = !publication.externalId;
      await savePublication(publication, {
        status: "publicado",
        externalId: ad.id,
        lastError: REVIEW_NOTE,
        meta: { importToken: response.token ?? undefined },
      });
      report[isNew ? "published" : "updated"] += 1;
    }
    return;
  }

  if (response.statusCode === -4 && response.errors.length) {
    const refused = new Map(
      response.errors.map((error) => [
        error.id,
        (error.messages ?? []).map((message) => message.category ?? "").filter(Boolean),
      ]),
    );
    const rest: Pending[] = [];
    for (const item of batch) {
      const categories = refused.get(item.ad.id);
      if (!categories) {
        rest.push(item);
        continue;
      }
      report.failed += 1;
      await failPublication(item.publication, new ApiError(400, describeValidation(categories)));
    }
    if (retry) await sendBatch(client, rest, report, false);
    return;
  }

  // -6 (sem plano) e -2/-5 (bloqueio, fora do ar) param a conexão, não o carro
  if ([-2, -5, -6].includes(response.statusCode)) {
    throw new ApiError(response.statusCode === -6 ? 403 : 502, describeImportStatus(response));
  }

  const message = describeImportStatus(response);
  for (const item of batch) {
    report.failed += 1;
    await failPublication(item.publication, new ApiError(400, message));
  }
}

/* ------------------------------------------------------------------------ */
/* Moderação                                                                 */
/* ------------------------------------------------------------------------ */

/**
 * Confere o que foi enviado e ainda não tem resposta da moderação. Aprovado
 * ganha URL e list_id (que é o que o destaque usa); recusado vira erro com o
 * motivo da OLX.
 */
async function checkReviews(client: OlxClient, tenantId: string): Promise<void> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(vehiclePublications)
    .where(
      and(
        eq(vehiclePublications.tenantId, tenantId),
        eq(vehiclePublications.portal, "olx"),
        eq(vehiclePublications.status, "publicado"),
      ),
    );
  const waiting = rows.filter((row) => row.lastError || !row.meta?.listId);

  // um lote responde por vários carros: consulta cada token uma vez só
  const byToken = new Map<string, VehiclePublication[]>();
  for (const row of waiting) {
    const token = row.meta?.importToken;
    if (!token) continue;
    byToken.set(token, [...(byToken.get(token) ?? []), row]);
  }

  for (const [token, publications] of byToken) {
    let status;
    try {
      status = await client.importStatus(token);
    } catch (error) {
      console.warn("[olx] status do lote indisponível", error);
      continue;
    }

    for (const publication of publications) {
      const ad = status?.ads?.[publication.externalId ?? ""];
      if (ad) {
        await applyReview(publication, ad.status, ad.list_id, ad.url, ad.message);
        continue;
      }
      // token vencido (7 dias): pergunta pelo anúncio, se já sabemos o list_id
      const listId = publication.meta?.listId;
      if (!status && listId) {
        const published = await client.adStatus(listId).catch(() => null);
        if (published) {
          await applyReview(
            publication,
            published.status,
            published.list_id,
            published.url,
            published.message,
          );
        }
      }
    }
  }
}

async function applyReview(
  publication: VehiclePublication,
  status: string,
  listId: string | undefined,
  url: string | undefined,
  messages: unknown,
): Promise<void> {
  if (isAccepted(status)) {
    await savePublication(publication, {
      lastError: null,
      externalUrl: url ?? publication.externalUrl,
      meta: listId ? { listId: String(listId) } : {},
    });
    return;
  }
  if (status === "refused" || status === "error") {
    await savePublication(publication, { status: "erro", lastError: describeProcessing(messages) });
    return;
  }
  if (status === "deleted") {
    await savePublication(publication, {
      status: "erro",
      lastError:
        "O anúncio foi removido na OLX (pela loja ou pela moderação). Sincronize para publicar de novo.",
    });
    return;
  }
  // pending / queued: continua esperando, mas guarda o list_id quando já veio
  await savePublication(publication, {
    lastError: status === "queued" ? "Aprovado. Entrando no ar na OLX." : REVIEW_NOTE,
    externalUrl: url ?? publication.externalUrl,
    meta: listId ? { listId: String(listId) } : {},
  });
}

/* ------------------------------------------------------------------------ */
/* Catálogo                                                                  */
/* ------------------------------------------------------------------------ */

class Catalog {
  constructor(private readonly client: OlxClient) {}

  private load(key: string, brand?: string, model?: string) {
    return cached(`portal:olx:${key}`, CATALOG_TTL, () => this.client.carInfo(brand, model));
  }

  async resolve(
    brandName: string,
    modelName: string,
    versionName: string | null,
  ): Promise<OlxCatalogIds> {
    const brand = matchBrand(brandName, await this.load("marcas"));
    if (!brand.ok)
      throw new ApiError(400, noMatchMessage("A OLX", "marca", brandName, brand.suggestions));

    const model = matchModel(
      modelName,
      await this.load(`modelos:${brand.entry.id}`, brand.entry.id),
    );
    if (!model.ok)
      throw new ApiError(400, noMatchMessage("A OLX", "modelo", modelName, model.suggestions));

    const versions = await this.load(
      `versoes:${brand.entry.id}:${model.entry.id}`,
      brand.entry.id,
      model.entry.id,
    );
    const version = matchVersion(versionName, versions);
    if (!version.ok) {
      throw new ApiError(400, noMatchMessage("A OLX", "versão", versionName, version.suggestions));
    }
    return { brand: brand.entry.id, model: model.entry.id, version: version.entry.id };
  }
}

/* ------------------------------------------------------------------------ */
/* Leads                                                                     */
/* ------------------------------------------------------------------------ */

/**
 * Cadastra na OLX a URL de leads desta loja. A OLX pede uma URL por
 * anunciante — é a nossa porta de entrada com o token da revenda. Falhar
 * aqui não para nada: a nota aparece no card, com a URL para cadastro manual.
 */
export async function configureOlxLeads(
  client: OlxClient,
  tenantId: string,
  origin: string,
  settings: OlxSettings,
): Promise<void> {
  const url = `${origin}${withBasePath("/api/portals/olx/leads")}?token=${await leadInboxToken(tenantId, "olx")}`;
  try {
    settings.leadConfigId = await client.configureLeads(url, settings.leadConfigId);
    delete settings.leadConfigError;
  } catch (error) {
    settings.leadConfigError = error instanceof Error ? error.message : String(error);
  }
}

/** Logo depois da autorização: deixa os leads ligados sem a loja fazer nada. */
export async function afterOlxConnect(tenantId: string, origin: string): Promise<void> {
  const connection = await getConnection(tenantId, "olx");
  if (!connection) return;
  const client = await openOlx(connection);
  const settings = { ...((connection.settings ?? {}) as OlxSettings) };
  await configureOlxLeads(client, tenantId, origin, settings);
  const db = await getDb();
  await db
    .update(portalConnections)
    .set({ settings })
    .where(eq(portalConnections.id, connection.id));
}

/* ------------------------------------------------------------------------ */
/* Plano e destaques                                                         */
/* ------------------------------------------------------------------------ */

export async function olxBalance(tenantId: string): Promise<OlxBalance | null> {
  const connection = await getConnection(tenantId, "olx");
  if (!connection || connection.status !== "conectado") return null;
  return (await openOlx(connection)).balance();
}

/**
 * Destaca um anúncio: volta ao topo agora e nas datas que o plano agendar.
 * Só existe para anúncio aprovado (precisa do list_id da OLX).
 */
export async function highlightOlxListing(tenantId: string, publicationId: string) {
  const connection = await getConnection(tenantId, "olx");
  if (!connection || connection.status !== "conectado")
    throw badRequest("A OLX não está conectada.");

  const db = await getDb();
  const rows = await db
    .select()
    .from(vehiclePublications)
    .where(
      and(
        eq(vehiclePublications.tenantId, tenantId),
        eq(vehiclePublications.id, publicationId),
        eq(vehiclePublications.portal, "olx"),
      ),
    )
    .limit(1);
  const publication = rows[0];
  if (!publication) throw badRequest("Anúncio não encontrado.");
  const listId = publication.meta?.listId;
  if (publication.status !== "publicado" || !listId) {
    throw badRequest(
      "Só dá para destacar anúncio já aprovado pela OLX. Sincronize e aguarde a moderação.",
    );
  }

  const next = await (await openOlx(connection)).bump(listId);
  const highlightedAt = new Date().toISOString();
  await db
    .update(vehiclePublications)
    .set({ meta: { ...(publication.meta ?? {}), highlightedAt, nextHighlights: next } })
    .where(eq(vehiclePublications.id, publication.id));
  return { highlightedAt, nextHighlights: next };
}
