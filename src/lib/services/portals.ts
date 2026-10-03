import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  portalConnections,
  vehiclePublications,
  vehicles,
  type PortalConnection,
  type PublicationMeta,
} from "@/db/schema";
import { badRequest, conflict } from "@/lib/http";
import { portalApp, portalAvailability } from "@/lib/integrations/portal-apps";
import { webmotorsToken } from "@/lib/integrations/webmotors";
import { WebmotorsStockClient } from "@/lib/integrations/webmotors-stock";
import { onlyDigits } from "@/lib/utils";
import type { OauthTokens } from "@/lib/integrations/portal-oauth";
import { getPortal, shouldBePublished, type PublicationStatus } from "@/lib/integrations/portals";
import { open, seal } from "@/lib/security/vault";

export async function listConnections(tenantId: string): Promise<PortalConnection[]> {
  const db = await getDb();
  return db.select().from(portalConnections).where(eq(portalConnections.tenantId, tenantId));
}

export async function getConnection(
  tenantId: string,
  portal: string,
): Promise<PortalConnection | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(portalConnections)
    .where(and(eq(portalConnections.tenantId, tenantId), eq(portalConnections.portal, portal)))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Liga a conta da revenda ao portal.
 *
 * As credenciais vão para o cofre antes de encostar no banco. Se o cofre não
 * estiver configurado, a operação falha aqui — nunca grava em claro para
 * "resolver depois".
 */
export async function connectPortal(
  tenantId: string,
  userId: string | null,
  portal: string,
  credentials: Record<string, string>,
): Promise<void> {
  const definition = getPortal(portal);
  if (!definition) throw badRequest("Portal desconhecido");
  if (definition.method !== "credentials") {
    throw badRequest(`${definition.name} não se conecta com credenciais coladas.`);
  }
  if (portalAvailability(definition) !== "pronto") {
    throw conflict(`${definition.name} ainda não está liberado para integração.`);
  }

  const missing = definition.fields
    .filter((field) => !field.optional && !credentials[field.key]?.trim())
    .map((field) => field.label);
  if (missing.length > 0) throw badRequest(`Faltou preencher: ${missing.join(", ")}`);

  /*
   * O que não é segredo também fica fora do cofre: é como o aviso do portal
   * acha a revenda sem abrir as credenciais de cada conexão.
   */
  const settings: Record<string, string> = {};
  for (const field of definition.fields) {
    const value = credentials[field.key]?.trim();
    if (!field.secret && value) settings[field.key] = value;
  }

  if (portal === "webmotors") {
    settings.cnpj = onlyDigits(settings.cnpj ?? "");
    if (settings.cnpj.length !== 14) throw badRequest("CNPJ da loja precisa ter 14 dígitos.");
    // senha errada aparece agora, e não no primeiro lead que não chegar
    const app = portalApp(definition);
    if (app) {
      await webmotorsToken(app, {
        username: settings.username,
        password: credentials.password ?? "",
      });
    }

    // a publicação é opcional, mas pela metade não: e-mail sem senha é erro de digitação
    const stockEmail = settings.stockEmail ?? "";
    const stockPassword = credentials.stockPassword?.trim() ?? "";
    if (Boolean(stockEmail) !== Boolean(stockPassword)) {
      throw badRequest(
        'Para publicar o estoque, informe o e-mail E a senha do usuário "Integração Revendedor".',
      );
    }
    if (stockEmail) {
      await WebmotorsStockClient.login({
        cnpj: settings.cnpj,
        email: stockEmail,
        password: stockPassword,
      });
    }
  }

  await storeConnection(tenantId, userId, portal, credentials, settings);
}

/**
 * Liga a conta depois que o portal devolveu os tokens no retorno do OAuth.
 *
 * A validação do fluxo (estado, nonce, sessão) é de quem chama: aqui só entra
 * o que o portal já aceitou.
 */
export async function connectOauthPortal(
  tenantId: string,
  userId: string | null,
  portal: string,
  tokens: OauthTokens,
): Promise<void> {
  const definition = getPortal(portal);
  if (!definition || definition.method !== "oauth") throw badRequest("Portal desconhecido");
  // o id da conta fica fora do cofre: é como o webhook do portal acha a revenda
  const settings = tokens.externalUserId ? { externalUserId: tokens.externalUserId } : {};
  await storeConnection(tenantId, userId, portal, tokens, settings);
}

async function storeConnection(
  tenantId: string,
  userId: string | null,
  portal: string,
  secrets: Record<string, string | undefined>,
  settings?: Record<string, unknown>,
): Promise<void> {
  const sealed = await seal(JSON.stringify(secrets));
  const db = await getDb();
  const existing = await getConnection(tenantId, portal);

  /*
   * Reconectar (trocar senha, reautorizar) não apaga as escolhas da loja,
   * como o tipo de anúncio padrão. Só os campos do formulário são
   * substituídos — o que ficou em branco agora some, de propósito.
   */
  const formKeys = new Set(getPortal(portal)?.fields.map((field) => field.key) ?? []);
  const kept = Object.fromEntries(
    Object.entries(existing?.settings ?? {}).filter(([key]) => !formKeys.has(key)),
  );
  const values = {
    credentials: sealed,
    status: "conectado" as const,
    connectedByUserId: userId,
    lastError: null,
    ...(settings ? { settings: { ...kept, ...settings } } : {}),
  };

  if (existing) {
    await db.update(portalConnections).set(values).where(eq(portalConnections.id, existing.id));
    return;
  }
  await db.insert(portalConnections).values({ tenantId, portal, ...values });
}

/**
 * Desliga e apaga as credenciais.
 *
 * As publicações ficam marcadas para remoção em vez de sumirem: os anúncios
 * continuam no ar no portal, e apagar o registro aqui deixaria a revenda sem
 * saber o que ainda está publicado por lá.
 */
export async function disconnectPortal(tenantId: string, portal: string): Promise<void> {
  const db = await getDb();
  const existing = await getConnection(tenantId, portal);
  if (!existing) throw badRequest("Portal não está conectado");

  await db
    .update(portalConnections)
    .set({ credentials: null, status: "desconectado", lastError: null })
    .where(eq(portalConnections.id, existing.id));

  await db
    .update(vehiclePublications)
    .set({ status: "removendo" })
    .where(
      and(
        eq(vehiclePublications.tenantId, tenantId),
        eq(vehiclePublications.portal, portal),
        inArray(vehiclePublications.status, ["publicado", "pendente"]),
      ),
    );
}

/**
 * Se a conexão publica anúncios. O Webmotors conectado só com o usuário dos
 * leads não publica nada: enfileirar carro para ele deixaria a tela cheia de
 * "aguardando envio" que nunca sai.
 */
export function connectionPublishes(connection: Pick<PortalConnection, "portal" | "settings">) {
  if (connection.portal === "webmotors") return Boolean(connection.settings?.stockEmail);
  return connection.portal === "mercadolivre" || connection.portal === "olx";
}

/** Credenciais decifradas, para o adaptador do portal usar. */
export async function readCredentials(
  connection: PortalConnection,
): Promise<Record<string, string>> {
  if (!connection.credentials) throw conflict("Portal sem credenciais guardadas");
  return JSON.parse(await open(connection.credentials)) as Record<string, string>;
}

/* ------------------------------------------------------------------------ */
/* Publicações                                                               */
/* ------------------------------------------------------------------------ */

export async function listPublications(tenantId: string, vehicleId?: string) {
  const db = await getDb();
  const where = vehicleId
    ? and(eq(vehiclePublications.tenantId, tenantId), eq(vehiclePublications.vehicleId, vehicleId))
    : eq(vehiclePublications.tenantId, tenantId);
  return db.select().from(vehiclePublications).where(where);
}

/**
 * Põe o veículo na fila de cada portal conectado.
 *
 * Chamada quando o carro muda aqui. Não fala com portal nenhum: só registra o
 * que precisa acontecer. Assim, salvar um veículo nunca fica lento nem falha
 * por causa de um portal fora do ar — quem entrega é a sincronização.
 */
export async function queueVehicleSync(tenantId: string, vehicleId: string): Promise<void> {
  const db = await getDb();

  const vehicleRows = await db
    .select({ status: vehicles.status })
    .from(vehicles)
    .where(and(eq(vehicles.tenantId, tenantId), eq(vehicles.id, vehicleId)))
    .limit(1);
  const vehicle = vehicleRows[0];
  if (!vehicle) return;

  const connections = (await listConnections(tenantId)).filter(
    (connection) => connection.status === "conectado" && connectionPublishes(connection),
  );
  if (connections.length === 0) return;

  const target: PublicationStatus = shouldBePublished(vehicle.status) ? "pendente" : "removendo";
  const existing = await listPublications(tenantId, vehicleId);

  for (const connection of connections) {
    const current = existing.find((row) => row.portal === connection.portal);

    if (!current) {
      // nunca publicado e já saindo de circulação: não há o que remover
      if (target === "removendo") continue;
      await db.insert(vehiclePublications).values({
        tenantId,
        vehicleId,
        portal: connection.portal,
        status: "pendente",
      });
      continue;
    }

    // já removido continua removido; reenfileirar criaria remoção infinita
    if (current.status === "removido" && target === "removendo") continue;

    await db
      .update(vehiclePublications)
      .set({ status: target, lastError: null })
      .where(eq(vehiclePublications.id, current.id));
  }
}

/**
 * Todos os anúncios de um portal, com o carro, para a tela de anúncios.
 *
 * O motivo (erro do portal ou nota de situação) vem junto: "Erro: 18" no
 * card não diz o que corrigir; ao lado do nome do carro, diz.
 */
export async function portalListings(tenantId: string, portal: string) {
  const db = await getDb();
  return db
    .select({
      id: vehiclePublications.id,
      vehicleId: vehiclePublications.vehicleId,
      status: vehiclePublications.status,
      detail: vehiclePublications.lastError,
      url: vehiclePublications.externalUrl,
      syncedAt: vehiclePublications.syncedAt,
      meta: vehiclePublications.meta,
      brand: vehicles.brand,
      model: vehicles.model,
      version: vehicles.version,
      yearModel: vehicles.yearModel,
      vehicleStatus: vehicles.status,
    })
    .from(vehiclePublications)
    .innerJoin(vehicles, eq(vehicles.id, vehiclePublications.vehicleId))
    .where(and(eq(vehiclePublications.tenantId, tenantId), eq(vehiclePublications.portal, portal)))
    .orderBy(asc(vehicles.brand), asc(vehicles.model), asc(vehicles.yearModel));
}

/**
 * Tipo de anúncio de UM carro. Nulo volta ao padrão do portal.
 *
 * Anúncio já no ar volta para a fila: a troca acontece no portal na próxima
 * sincronização (Webmotors troca a modalidade, ML o listing type), sem
 * despublicar.
 */
export async function setPublicationListingType(
  tenantId: string,
  publicationId: string,
  listingType: string | null,
): Promise<void> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(vehiclePublications)
    .where(
      and(eq(vehiclePublications.tenantId, tenantId), eq(vehiclePublications.id, publicationId)),
    )
    .limit(1);
  const row = rows[0];
  if (!row) throw badRequest("Anúncio não encontrado");

  const meta: PublicationMeta = { ...(row.meta ?? {}) };
  if (listingType) meta.listingType = listingType;
  else delete meta.listingType;

  await db
    .update(vehiclePublications)
    .set({
      meta,
      // removido continua removido: o tipo vale para quando voltar ao ar
      ...(row.status === "publicado" ? { status: "pendente" as const } : {}),
    })
    .where(eq(vehiclePublications.id, row.id));
}

/** Ajustes do portal que a revenda controla (hoje: o tipo de anúncio padrão). */
export async function updateConnectionSettings(
  tenantId: string,
  portal: string,
  changes: Record<string, unknown>,
): Promise<void> {
  const existing = await getConnection(tenantId, portal);
  if (!existing || existing.status !== "conectado") throw badRequest("Portal não está conectado");
  const db = await getDb();
  await db
    .update(portalConnections)
    .set({ settings: { ...(existing.settings ?? {}), ...changes } })
    .where(eq(portalConnections.id, existing.id));
}

/**
 * Põe o estoque inteiro na fila.
 *
 * Conectar um portal com carros já cadastrados precisa publicar o que existe,
 * não só o que for salvo dali em diante — e "Sincronizar agora" é a promessa
 * de que o portal reflete o estoque, não a fila. Rascunho fica de fora;
 * vendido com anúncio no ar entra para remoção.
 */
export async function queueTenantStock(tenantId: string): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select({ id: vehicles.id })
    .from(vehicles)
    .where(eq(vehicles.tenantId, tenantId));
  for (const row of rows) await queueVehicleSync(tenantId, row.id);
  return rows.length;
}

/** Resumo por portal, para a tela dizer o que está no ar e o que travou. */
export async function publicationSummary(tenantId: string) {
  const rows = await listPublications(tenantId);
  const byPortal = new Map<string, Record<PublicationStatus, number>>();

  for (const row of rows) {
    const current = byPortal.get(row.portal) ?? {
      pendente: 0,
      publicado: 0,
      removendo: 0,
      removido: 0,
      erro: 0,
    };
    current[row.status] += 1;
    byPortal.set(row.portal, current);
  }

  return [...byPortal.entries()].map(([portal, counts]) => ({ portal, ...counts }));
}
