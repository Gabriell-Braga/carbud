import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { getDb } from "@/db";
import {
  portalConnections,
  vehiclePublications,
  vehicles,
  type PortalConnection,
  type VehiclePublication,
} from "@/db/schema";
import { ApiError } from "@/lib/http";
import {
  MercadoLivreClient,
  itemPayload,
  itemStatusNote,
  normalizeName,
  refreshTokens,
  stateName,
  updatePayload,
  type MlLocation,
  type SellerInfo,
} from "@/lib/integrations/mercadolivre";
import { portalApp } from "@/lib/integrations/portal-apps";
import type { OauthTokens } from "@/lib/integrations/portal-oauth";
import { getPortal, shouldBePublished } from "@/lib/integrations/portals";
import { seal } from "@/lib/security/vault";
import { pullPortalLeads, retryWebmotorsLeads } from "./portal-leads";
import { connectionPublishes, getConnection, readCredentials } from "./portals";
import { closeChavesNaMaoAds, syncChavesNaMao } from "./portal-sync-chavesnamao";
import { openOlx, syncOlx } from "./portal-sync-olx";
import { closeWebmotorsAds, syncWebmotorsStock } from "./portal-sync-webmotors";
import { emptyReport, pictureUrls, sellerInfo, type SyncReport } from "./portal-sync-shared";

export type { SyncReport } from "./portal-sync-shared";

/**
 * Executa a fila de publicações contra os portais.
 *
 * Roda depois que a resposta ao painel já saiu (waitUntil), pelo botão
 * "Sincronizar agora" e pelo agendador. É idempotente: cada publicação diz
 * em que estado está, e processar duas vezes não cria anúncio em dobro —
 * quem já tem externalId é atualizado, não recriado.
 *
 * Adaptadores: Mercado Livre e OLX (API REST, OAuth), Webmotors (SOAP do
 * gestor de estoque terceiro, quando a loja informou o usuário de estoque) e
 * Chaves na Mão (API REST, com o token de integração da loja).
 */

/** O que o adaptador guarda na conexão, fora do cofre (nada disso é segredo). */
type MlSettings = {
  externalUserId?: string;
  location?: MlLocation;
  listingTypeId?: string;
};

export async function syncTenantPortals(tenantId: string, origin: string): Promise<SyncReport[]> {
  const reports: SyncReport[] = [];

  const connection = await getConnection(tenantId, "mercadolivre");
  if (connection && connection.status === "conectado") {
    reports.push(await syncMercadoLivre(connection, origin));
  }

  const olx = await getConnection(tenantId, "olx");
  if (olx && olx.status === "conectado") reports.push(await syncOlx(olx, origin));

  const chavesNaMao = await getConnection(tenantId, "chavesnamao");
  if (chavesNaMao && chavesNaMao.status === "conectado") {
    reports.push(await syncChavesNaMao(chavesNaMao, origin));
  }

  // Webmotors: estoque pelo SOAP (se configurado) e os avisos de lead que falharam
  const webmotors = await getConnection(tenantId, "webmotors");
  if (webmotors && webmotors.status === "conectado") {
    const report = connectionPublishes(webmotors)
      ? await syncWebmotorsStock(webmotors, origin)
      : emptyReport("webmotors");
    const ingest = await retryWebmotorsLeads(tenantId);
    report.failed += ingest.failed;
    report.leads += ingest.created;
    if (!report.error) {
      const db = await getDb();
      await db
        .update(portalConnections)
        .set({ lastSyncAt: new Date(), lastError: null })
        .where(eq(portalConnections.id, webmotors.id));
    }
    reports.push(report);
  }

  return reports;
}

/**
 * Dispara a sincronização sem segurar a resposta.
 *
 * No Cloudflare, `waitUntil` mantém o worker vivo depois do retorno; fora
 * dele (dev, testes) espera mesmo. Erro aqui nunca sobe: a fila registra o
 * que falhou e a próxima passada tenta de novo.
 */
export async function syncInBackground(tenantId: string, origin: string): Promise<void> {
  const job = syncTenantPortals(tenantId, origin).catch((error) => {
    console.error("[portais] sincronização falhou", error);
  });
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const context = await getCloudflareContext({ async: true });
    context.ctx.waitUntil(job);
  } catch {
    await job;
  }
}

/* ------------------------------------------------------------------------ */
/* Mercado Livre                                                             */
/* ------------------------------------------------------------------------ */

async function syncMercadoLivre(connection: PortalConnection, origin: string): Promise<SyncReport> {
  const report: SyncReport = {
    portal: "mercadolivre",
    published: 0,
    updated: 0,
    removed: 0,
    failed: 0,
    leads: 0,
  };
  const db = await getDb();

  const queue = await db
    .select()
    .from(vehiclePublications)
    .where(
      and(
        eq(vehiclePublications.tenantId, connection.tenantId),
        eq(vehiclePublications.portal, "mercadolivre"),
        // erro entra de novo a cada passada: a pessoa corrige a ficha ou a
        // conta e clica em sincronizar — sem isso, o erro seria definitivo
        inArray(vehiclePublications.status, ["pendente", "removendo", "erro"]),
      ),
    );
  let session: MlSession;
  try {
    session = await openSession(connection);
  } catch (error) {
    // sem acesso não há o que tentar por carro: a conexão inteira está parada
    const message = error instanceof Error ? error.message : String(error);
    await db
      .update(portalConnections)
      .set({ status: "erro", lastError: message })
      .where(eq(portalConnections.id, connection.id));
    return { ...report, error: message };
  }

  // publicado com nota (revisão, pagamento): confere se o ML já liberou
  const watching = await db
    .select()
    .from(vehiclePublications)
    .where(
      and(
        eq(vehiclePublications.tenantId, connection.tenantId),
        eq(vehiclePublications.portal, "mercadolivre"),
        eq(vehiclePublications.status, "publicado"),
        isNotNull(vehiclePublications.lastError),
      ),
    );
  for (const publication of watching) {
    if (!publication.externalId) continue;
    try {
      const item = await session.client.getItem(publication.externalId);
      await db
        .update(vehiclePublications)
        .set({
          lastError: itemStatusNote(item),
          externalUrl: item.permalink ?? publication.externalUrl,
        })
        .where(eq(vehiclePublications.id, publication.id));
    } catch (error) {
      console.warn("[portais] não consultou o anúncio", publication.externalId, error);
    }
  }

  for (const publication of queue) {
    try {
      const outcome = await processPublication(session, publication, origin);
      report[outcome] += 1;
    } catch (error) {
      report.failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      await db
        .update(vehiclePublications)
        .set({ status: "erro", lastError: message, syncedAt: new Date() })
        .where(eq(vehiclePublications.id, publication.id));
    }
  }

  /*
   * A volta: perguntas no anúncio viram lead no CRM. Depois da fila de
   * propósito — se a conta estiver sem acesso, já saímos lá em cima, e o
   * token renovado aqui é o mesmo que busca as perguntas.
   */
  const ingest = await pullPortalLeads(connection.tenantId, "mercadolivre", {
    mercadoLivre: session.client,
  });
  report.leads = ingest.created;
  report.failed += ingest.failed;

  await db
    .update(portalConnections)
    .set({ lastSyncAt: new Date(), lastError: null, settings: session.settings })
    .where(eq(portalConnections.id, connection.id));

  return report;
}

type MlSession = {
  connection: PortalConnection;
  client: MercadoLivreClient;
  tokens: OauthTokens;
  settings: MlSettings;
};

/**
 * Abre o acesso, renovando o token se ele vence em breve.
 *
 * A renovação grava ANTES de usar: o refresh token antigo já morreu quando
 * o novo chega, e uma falha entre receber e gravar deixaria a conexão sem
 * volta. Gravar primeiro custa uma escrita; não gravar custa reconectar.
 */
async function openSession(connection: PortalConnection): Promise<MlSession> {
  const portal = getPortal("mercadolivre")!;
  const app = portalApp(portal);
  if (!app) throw new ApiError(409, "Mercado Livre ainda não está liberado para integração.");

  let tokens = (await readCredentials(connection)) as OauthTokens;
  const settings: MlSettings = { ...(connection.settings as MlSettings | null) };

  const expiresSoon =
    !tokens.expiresAt || Date.parse(tokens.expiresAt) - Date.now() < 5 * 60 * 1000;
  if (expiresSoon) {
    if (!tokens.refreshToken) {
      throw new ApiError(401, "O acesso ao Mercado Livre venceu. Conecte a conta de novo.");
    }
    tokens = await refreshTokens(app, tokens.refreshToken);
    if (tokens.externalUserId) settings.externalUserId = tokens.externalUserId;
    const db = await getDb();
    await db
      .update(portalConnections)
      .set({ credentials: await seal(JSON.stringify(tokens)), settings })
      .where(eq(portalConnections.id, connection.id));
  }

  return { connection, client: new MercadoLivreClient(tokens.accessToken), tokens, settings };
}

type Outcome = "published" | "updated" | "removed";

async function processPublication(
  session: MlSession,
  publication: VehiclePublication,
  origin: string,
): Promise<Outcome> {
  const db = await getDb();

  const vehicleRows = await db
    .select()
    .from(vehicles)
    .where(eq(vehicles.id, publication.vehicleId))
    .limit(1);
  const vehicle = vehicleRows[0];
  if (!vehicle) throw new ApiError(404, "Veículo não existe mais.");

  // "erro" não diz para que lado estava indo; a situação do carro diz
  const removing =
    publication.status === "removendo" ||
    (publication.status === "erro" && !shouldBePublished(vehicle.status));

  if (removing) {
    if (publication.externalId) await session.client.closeItem(publication.externalId);
    await db
      .update(vehiclePublications)
      .set({ status: "removido", lastError: null, syncedAt: new Date() })
      .where(eq(vehiclePublications.id, publication.id));
    return "removed";
  }

  if (vehicle.priceOnRequest || vehicle.priceCents <= 0) {
    throw new ApiError(400, "O Mercado Livre exige preço; este veículo está como 'sob consulta'.");
  }

  const pictures = await pictureUrls(vehicle.id, origin);
  if (pictures.length === 0) {
    throw new ApiError(400, "O Mercado Livre exige pelo menos uma foto.");
  }

  const seller = await sellerInfo(vehicle);
  const location = await resolveLocation(session, seller);
  /*
   * Tipo: o pedido para este carro; senão o que o anúncio já tem (trocar o
   * padrão da conta não mexe em anúncio no ar); senão o padrão.
   */
  const listingTypeId =
    publication.meta?.listingType ??
    publication.meta?.appliedListingType ??
    (await resolveListingType(session));
  const input = { vehicle, pictureUrls: pictures, seller, location, listingTypeId };

  if (publication.externalId) {
    // anúncio no ar não muda de tipo pelo PUT do item: é um endpoint próprio
    const wanted = publication.meta?.listingType;
    if (wanted && wanted !== publication.meta?.appliedListingType) {
      await session.client.changeListingType(publication.externalId, listingTypeId);
    }
    const updated = await session.client.updateItem(publication.externalId, updatePayload(input));
    await session.client.setDescription(
      publication.externalId,
      vehicle.description?.trim() || input.vehicle.model,
    );
    await db
      .update(vehiclePublications)
      .set({
        status: "publicado",
        lastError: itemStatusNote(updated),
        meta: { ...(publication.meta ?? {}), appliedListingType: listingTypeId },
        syncedAt: new Date(),
      })
      .where(eq(vehiclePublications.id, publication.id));
    return "updated";
  }

  const created = await session.client.createItem(itemPayload(input));
  await db
    .update(vehiclePublications)
    .set({
      status: "publicado",
      externalId: created.id,
      externalUrl: created.permalink ?? null,
      // publicado com nota: o ML aceitou, mas ainda não mostra (revisão, pagamento)
      lastError: itemStatusNote(created),
      meta: { ...(publication.meta ?? {}), appliedListingType: listingTypeId },
      syncedAt: new Date(),
    })
    .where(eq(vehiclePublications.id, publication.id));
  return "published";
}

/**
 * Cidade e estado viram ids do ML uma vez por endereço e ficam na conexão.
 * O ML lista ~5.500 cidades por chamada de estado; não é para repetir a
 * cada carro.
 */
async function resolveLocation(session: MlSession, seller: SellerInfo): Promise<MlLocation> {
  if (!seller.city || !seller.state) {
    throw new ApiError(
      400,
      "O Mercado Livre exige o endereço da loja. Preencha cidade e estado em Site ou na unidade.",
    );
  }
  const key = `${normalizeName(stateName(seller.state))}|${normalizeName(seller.city)}`;
  if (session.settings.location?.key === key) return session.settings.location;

  const wantedState = normalizeName(stateName(seller.state));
  const { states } = await session.client.states();
  const state = states.find((item) => normalizeName(item.name) === wantedState);
  if (!state)
    throw new ApiError(400, `Estado "${seller.state}" não foi reconhecido pelo Mercado Livre.`);

  const wantedCity = normalizeName(seller.city);
  const { cities } = await session.client.cities(state.id);
  const city = cities.find((item) => normalizeName(item.name) === wantedCity);
  if (!city) {
    throw new ApiError(
      400,
      `Cidade "${seller.city}" não foi encontrada em ${state.name} no Mercado Livre. Confira a grafia no endereço.`,
    );
  }

  session.settings.location = { stateId: state.id, cityId: city.id, key };
  return session.settings.location;
}

/**
 * O tipo de anúncio depende do plano da conta no ML. Gratuito quando a conta
 * tem direito; senão o primeiro que ela pode usar. Fica guardado; a revenda
 * pode trocar depois quando existir a opção na tela.
 */
async function resolveListingType(session: MlSession): Promise<string> {
  if (session.settings.listingTypeId) return session.settings.listingTypeId;

  const userId = session.settings.externalUserId ?? session.tokens.externalUserId;
  if (!userId)
    throw new ApiError(409, "Conexão sem o id da conta no Mercado Livre. Conecte de novo.");

  const { available } = await session.client.availableListingTypes(userId);
  const chosen = available.find((type) => type.id === "free") ?? available[0];
  if (!chosen) {
    throw new ApiError(
      409,
      "A conta no Mercado Livre não tem nenhum tipo de anúncio de veículo disponível.",
    );
  }
  session.settings.listingTypeId = chosen.id;
  return chosen.id;
}

/**
 * Tipos de anúncio que a conta pode usar, para a revenda escolher.
 *
 * O gratuito tem cota pequena em veículos; quando ela acaba o ML recusa
 * com "listing type temporarily unavailable", e a saída é escolher um pago.
 */
export async function mercadoLivreListingTypes(
  tenantId: string,
): Promise<{ current: string | null; available: { id: string; name: string }[] } | null> {
  const connection = await getConnection(tenantId, "mercadolivre");
  if (!connection || connection.status !== "conectado") return null;
  const stored = (connection.settings as MlSettings | null)?.listingTypeId ?? null;
  try {
    const session = await openSession(connection);
    const userId = session.settings.externalUserId ?? session.tokens.externalUserId;
    if (!userId) return { current: stored, available: [] };
    const { available } = await session.client.availableListingTypes(userId);
    return { current: stored, available };
  } catch (error) {
    console.warn("[portais] não listou os tipos de anúncio", error);
    return { current: stored, available: [] };
  }
}

/**
 * Fecha os anúncios de um veículo que vai ser apagado.
 *
 * Apagar cascateia as publicações — e com elas o id do anúncio no portal.
 * Sem fechar antes, o anúncio fica órfão no ar, gerando lead de carro que
 * não existe. Falha aqui não impede a exclusão: fica registrada.
 */
export async function closePublicationsBeforeDelete(
  tenantId: string,
  vehicleId: string,
): Promise<void> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(vehiclePublications)
    .where(
      and(eq(vehiclePublications.tenantId, tenantId), eq(vehiclePublications.vehicleId, vehicleId)),
    );
  const open = rows.filter((row) => row.externalId && row.status !== "removido");

  for (const portal of new Set(open.map((row) => row.portal))) {
    const ids = open.filter((row) => row.portal === portal).map((row) => row.externalId!);
    const connection = await getConnection(tenantId, portal);
    if (!connection || connection.status !== "conectado") continue;
    try {
      if (portal === "mercadolivre") {
        const session = await openSession(connection);
        for (const id of ids) await session.client.closeItem(id);
      } else if (portal === "olx") {
        const client = await openOlx(connection);
        await client.importAds(ids.map((id) => ({ id, operation: "delete" })));
      } else if (portal === "webmotors" && connectionPublishes(connection)) {
        await closeWebmotorsAds(connection, ids);
      } else if (portal === "chavesnamao") {
        await closeChavesNaMaoAds(connection, ids);
      }
    } catch (error) {
      console.error("[portais] não removeu anúncio antes de apagar o veículo", portal, error);
    }
  }
}
