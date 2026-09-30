import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  leadEvents,
  leads,
  vehiclePublications,
  vehicles,
  webhookEvents,
  type WebhookEvent,
} from "@/db/schema";
import type { IncomingPortalLead } from "@/lib/integrations/portal-lead-inbox";
import {
  buyerName,
  parseQuestion,
  type MercadoLivreClient,
  type MlQuestion,
} from "@/lib/integrations/mercadolivre";
import { portalApp } from "@/lib/integrations/portal-apps";
import { getPortal } from "@/lib/integrations/portals";
import {
  fetchLeadDetail,
  parseLeadDetail,
  parseLeadNotice,
  webmotorsToken,
  type WebmotorsLeadNotice,
} from "@/lib/integrations/webmotors";
import { dispatchTenantEvent } from "@/lib/services/api-access";
import { listStages, pickAssignee, recordLeadEvent } from "@/lib/services/crm";
import { notifyNewLead } from "@/lib/services/notifications";
import { getConnection, readCredentials } from "@/lib/services/portals";
import { trackInBackground } from "@/lib/tracking/dispatch";
import { newEventId } from "@/lib/tracking/event";

/**
 * A volta da integração com os portais: quem procura o carro no anúncio vira
 * lead no CRM.
 *
 * A ida (carro daqui → anúncio no portal) é o `portal-sync`. Sem esta metade,
 * a revenda publica pelo painel e continua atendendo dentro do portal, com o
 * funil, o rodízio de vendedor e o relatório cegos para tudo que vem de lá —
 * que costuma ser a maior fonte de contato de uma loja.
 *
 * O contato chega por DOIS caminhos, e os dois terminam em
 * `registerPortalLead`, que é quem sabe virar lead:
 *
 * 1. **O portal avisa e nós buscamos** (`pullPortalLeads`). É o caso do
 *    Mercado Livre: ele notifica a pergunta, e a API dela é aberta para o
 *    vendedor. Depende de existir API de leads no portal e de termos acesso
 *    de integrador nele.
 *
 * 2. **O portal entrega no nosso endereço** (`/api/portals/<portal>/leads`,
 *    ver `portal-lead-inbox`). Vale para qualquer portal, inclusive os que
 *    só publicamos por feed: a loja cadastra a URL de leads lá dentro e o
 *    contato entra aqui na hora. É o caminho que faz "todos os portais"
 *    existir hoje, sem esperar acordo de API com cada um.
 *
 * Depois do `registerPortalLead`, um lead de portal é um lead como outro
 * qualquer: etapa do funil, rodízio, linha do tempo, webhook para quem
 * integrou, relatório.
 */

/** Quantas notificações processar por passada. */
const BATCH = 25;

export type LeadIngestReport = {
  /** Leads novos. */
  created: number;
  /** Mensagens que entraram num lead que já existia. */
  appended: number;
  /** O que não deu em lead (tópico que não usamos, anúncio de outra conta). */
  ignored: number;
  failed: number;
};

export function emptyIngestReport(): LeadIngestReport {
  return { created: 0, appended: 0, ignored: 0, failed: 0 };
}

/* ------------------------------------------------------------------------ */
/* O que vale para todo portal                                               */
/* ------------------------------------------------------------------------ */

export type RegisterOutcome = "created" | "appended" | "ignored";

/**
 * Grava o contato do portal como lead — ou como mensagem nova, se a mesma
 * pessoa já falou sobre o mesmo carro.
 *
 * Um lead por pessoa por anúncio. Quem pergunta costuma perguntar de novo
 * ("tem troca?", "aceita financiamento?"), e cada pergunta virando uma ficha
 * daria à revenda três atendimentos do mesmo negócio.
 *
 * `strict` diz o que fazer quando o anúncio não é de um carro nosso: no
 * caminho 1 (nós varremos a conta inteira do portal) isso significa anúncio
 * que não saiu do painel, e o lead é ignorado; no caminho 2 é a loja quem
 * aponta para cá, então o lead entra mesmo sem casar com um carro — melhor um
 * lead sem veículo do que um lead perdido.
 */
export async function registerPortalLead(
  tenantId: string,
  incoming: IncomingPortalLead,
  {
    strict = false,
    resolveName,
  }: {
    strict?: boolean;
    /**
     * Busca o nome de quem procurou, e só quando o lead vai mesmo nascer.
     *
     * No Mercado Livre o nome é outra chamada à API, e ela seria desperdiçada
     * nas duas situações mais comuns: pergunta num anúncio que não saiu do
     * painel, e pergunta seguinte de alguém que já é lead.
     */
    resolveName?: () => Promise<string>;
  } = {},
): Promise<RegisterOutcome> {
  const db = await getDb();
  const portalName = getPortal(incoming.portal)?.name ?? incoming.portal;

  const match = incoming.adExternalId
    ? await db
        .select({
          vehicleId: vehiclePublications.vehicleId,
          externalUrl: vehiclePublications.externalUrl,
        })
        .from(vehiclePublications)
        .where(
          and(
            eq(vehiclePublications.tenantId, tenantId),
            eq(vehiclePublications.portal, incoming.portal),
            eq(vehiclePublications.externalId, incoming.adExternalId),
          ),
        )
        .limit(1)
    : [];

  if (strict && !match[0]) return "ignored";

  const vehicleColumns = {
    id: vehicles.id,
    brand: vehicles.brand,
    model: vehicles.model,
    version: vehicles.version,
    yearModel: vehicles.yearModel,
  };
  const vehicleRows = match[0]
    ? await db
        .select(vehicleColumns)
        .from(vehicles)
        .where(eq(vehicles.id, match[0].vehicleId))
        .limit(1)
    : incoming.plate
      ? // anúncio que não saiu da nossa fila: a placa é o que liga ao carro
        await db
          .select(vehicleColumns)
          .from(vehicles)
          .where(
            and(
              eq(vehicles.tenantId, tenantId),
              sql`upper(replace(${vehicles.licensePlate}, '-', '')) = ${incoming.plate}`,
            ),
          )
          .limit(1)
      : [];

  const vehicle = vehicleRows[0] ?? null;
  const vehicleLabel = vehicle
    ? [vehicle.brand, vehicle.model, vehicle.version, vehicle.yearModel].filter(Boolean).join(" ")
    : null;
  const url = incoming.url ?? match[0]?.externalUrl ?? null;

  const existing = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(eq(leads.tenantId, tenantId), eq(leads.externalId, incoming.externalId)))
    .limit(1);

  if (existing[0]) {
    const added = await appendMessage(tenantId, existing[0].id, incoming, portalName);
    return added ? "appended" : "ignored";
  }

  const name = incoming.name || (resolveName ? await resolveName() : "") || "Contato sem nome";

  const stages = await listStages(tenantId);
  const firstStage = stages.find((stage) => stage.kind === "open") ?? stages[0] ?? null;
  const assignedToUserId = await pickAssignee(tenantId, null);

  const created = await db
    .insert(leads)
    .values({
      tenantId,
      vehicleId: vehicle?.id ?? null,
      vehicleLabel,
      name,
      /*
       * Pode ser vazio: no Mercado Livre o telefone não existe antes da
       * venda. A tela mostra "sem telefone" e esconde o WhatsApp em vez de
       * abrir um link morto.
       */
      phone: incoming.phone ?? "",
      email: incoming.email,
      message: composeMessage(incoming, portalName, url),
      source: "portal",
      status: "new",
      stageId: firstStage?.id ?? null,
      assignedToUserId,
      externalId: incoming.externalId,
      utm: { source: incoming.portal, medium: "portal" },
    })
    .returning({ id: leads.id });

  const leadId = created[0].id;

  await recordLeadEvent({
    tenantId,
    leadId,
    type: "created",
    body: vehicleLabel ? `Lead do ${portalName} sobre ${vehicleLabel}.` : `Lead do ${portalName}.`,
    metadata: {
      source: "portal",
      portal: incoming.portal,
      externalId: incoming.externalId,
      ...(url ? { url } : {}),
    },
  });

  /*
   * Lead de portal também é conversão: ele veio do anúncio, que muitas vezes
   * é anúncio pago. Sem navegador do outro lado não há pixel para deduplicar,
   * então o id é novo — o que o servidor manda aqui é o único registro.
   */
  await trackInBackground(tenantId, {
    name: "lead",
    eventId: newEventId("portal-lead"),
    value: null,
    user: {
      email: incoming.email,
      phone: incoming.phone,
      name,
    },
    content: vehicle ? { id: vehicle.id, name: vehicleLabel } : undefined,
    sourceUrl: url,
  });

  await notifyNewLead({
    tenantId,
    lead: {
      id: leadId,
      name,
      // lead de portal pode vir sem telefone; o tipo do banco guarda texto
      phone: incoming.phone ?? "",
      email: incoming.email,
      message: incoming.message,
      vehicleLabel,
      assignedToUserId,
    },
    origin: portalName,
  });

  await dispatchTenantEvent(tenantId, "lead.created", {
    id: leadId,
    name,
    phone: incoming.phone,
    email: incoming.email,
    vehicle: vehicleLabel,
    source: "portal",
    portal: incoming.portal,
  });

  return "created";
}

function composeMessage(
  incoming: IncomingPortalLead,
  portalName: string,
  url: string | null,
): string {
  const parts = [
    incoming.message
      ? `Contato pelo ${portalName}: "${incoming.message}"`
      : `Contato pelo ${portalName}.`,
  ];
  if (url) parts.push(`Anúncio: ${url}`);
  if (!incoming.phone && incoming.email) parts.push(`Responda por e-mail: ${incoming.email}`);
  if (!incoming.phone && !incoming.email) parts.push("Responda pelo próprio portal.");
  return parts.join("\n\n");
}

/**
 * A mensagem seguinte da mesma pessoa entra como evento no lead que existe.
 *
 * Devolve false quando aquela mensagem já está na linha do tempo: o portal
 * reavisa (o ML avisa de novo quando a pergunta é respondida, e um integrador
 * pode reenviar o mesmo lead), e sem esta conferência a mesma frase apareceria
 * duas vezes para quem atende.
 */
async function appendMessage(
  tenantId: string,
  leadId: string,
  incoming: IncomingPortalLead,
  portalName: string,
): Promise<boolean> {
  const db = await getDb();
  const timeline = await db
    .select({ metadata: leadEvents.metadata })
    .from(leadEvents)
    .where(eq(leadEvents.leadId, leadId));

  const mark = incoming.messageId ?? incoming.message ?? null;
  if (!mark) return false;
  if (timeline.some((row) => row.metadata?.messageId === mark)) return false;

  await recordLeadEvent({
    tenantId,
    leadId,
    type: "note",
    body: incoming.message
      ? `Nova mensagem no ${portalName}: "${incoming.message}"`
      : `Novo contato no ${portalName}.`,
    metadata: { portal: incoming.portal, messageId: mark },
  });
  return true;
}

/* ------------------------------------------------------------------------ */
/* Caminho 1: o portal avisa, nós buscamos                                   */
/* ------------------------------------------------------------------------ */

/**
 * Adaptador de leitura de leads de um portal.
 *
 * Só o Mercado Livre tem um hoje: é o único com aviso por webhook e API de
 * perguntas liberada para o vendedor. OLX, Webmotors e iCarros entram aqui
 * quando tivermos acesso de integrador à API de leads de cada um — até lá,
 * eles recebem lead pelo caminho 2, que não depende de acordo nenhum.
 */
type LeadPuller = {
  /** Lê os avisos pendentes daquele portal e devolve o que virou lead. */
  pull(tenantId: string, context: PullContext): Promise<LeadIngestReport>;
};

export type PullContext = {
  /** Cliente já autenticado do portal, quando o adaptador precisa de um. */
  mercadoLivre?: MercadoLivreClient;
};

const PULLERS: Record<string, LeadPuller> = {
  mercadolivre: {
    pull: (tenantId, context) =>
      context.mercadoLivre
        ? pullMercadoLivre(tenantId, context.mercadoLivre)
        : Promise.resolve(emptyIngestReport()),
  },
};

export function hasLeadPuller(portal: string): boolean {
  return portal in PULLERS;
}

export async function pullPortalLeads(
  tenantId: string,
  portal: string,
  context: PullContext,
): Promise<LeadIngestReport> {
  const puller = PULLERS[portal];
  if (!puller) return emptyIngestReport();
  return puller.pull(tenantId, context);
}

/**
 * Só `/questions/<número>` é aceito.
 *
 * O caminho vem de fora, e é ele que monta a chamada à API com o token da
 * revenda. Validar aqui é o que impede um aviso forjado de nos fazer buscar
 * um recurso qualquer da conta dela.
 */
export function questionResource(resource: string): string | null {
  return /^\/questions\/\d+$/.test(resource) ? resource : null;
}

/**
 * Identidade do lead no Mercado Livre: um lead por comprador por anúncio.
 */
export function mercadoLivreLeadKey(question: MlQuestion): string {
  return `mercadolivre:${question.itemId}:${question.fromUserId}`;
}

async function pullMercadoLivre(
  tenantId: string,
  client: MercadoLivreClient,
): Promise<LeadIngestReport> {
  const report = emptyIngestReport();
  const db = await getDb();

  const pending = await db
    .select()
    .from(webhookEvents)
    .where(
      and(
        eq(webhookEvents.provider, "mercadolivre"),
        eq(webhookEvents.tenantId, tenantId),
        isNull(webhookEvents.processedAt),
      ),
    )
    .orderBy(asc(webhookEvents.receivedAt))
    .limit(BATCH);

  for (const event of pending) {
    try {
      const outcome = await processMercadoLivreNotification(tenantId, client, event);
      report[outcome] += 1;
      await db
        .update(webhookEvents)
        .set({ processedAt: new Date(), error: null })
        .where(eq(webhookEvents.id, event.id));
    } catch (error) {
      report.failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      /*
       * Fica com erro e SEM processedAt de propósito: a próxima passada tenta
       * de novo. Token vencido e instabilidade do portal são o caso comum
       * aqui, e os dois passam sozinhos — marcar como processado perderia o
       * lead.
       */
      await db.update(webhookEvents).set({ error: message }).where(eq(webhookEvents.id, event.id));
    }
  }

  return report;
}

async function processMercadoLivreNotification(
  tenantId: string,
  client: MercadoLivreClient,
  event: WebhookEvent,
): Promise<RegisterOutcome> {
  // outros tópicos (items, orders) chegam porque a assinatura é por app;
  // aqui só a pergunta vira lead
  if (event.eventType !== "questions") return "ignored";

  const resource = typeof event.payload?.resource === "string" ? event.payload.resource : "";
  const path = questionResource(resource);
  if (!path) return "ignored";

  const question = parseQuestion(await client.getResource(path));
  if (!question || !question.text) return "ignored";

  return registerPortalLead(
    tenantId,
    {
      portal: "mercadolivre",
      externalId: mercadoLivreLeadKey(question),
      // o nome é outra chamada à API: só vale a pena se o lead nascer
      name: "",
      // o ML não entrega telefone nem e-mail antes da venda
      phone: null,
      email: null,
      message: question.text,
      messageId: question.id,
      adExternalId: question.itemId,
      url: null,
    },
    {
      // a conta do ML pode ter anúncios que não saíram do painel
      strict: true,
      resolveName: async () =>
        buyerName(await client.getUser(question.fromUserId).catch(() => null), question.fromUserId),
    },
  );
}

/* ------------------------------------------------------------------------ */
/* Webmotors: o aviso traz só o id, nós buscamos o lead                      */
/* ------------------------------------------------------------------------ */

/**
 * Busca o lead avisado e grava no CRM da revenda.
 *
 * O token é pedido a cada aviso: lead de uma loja chega em minutos, não em
 * rajada, e guardar token vencido para economizar um login custaria mais
 * código do que o login custa.
 */
export async function ingestWebmotorsLead(
  tenantId: string,
  notice: WebmotorsLeadNotice,
): Promise<RegisterOutcome> {
  const definition = getPortal("webmotors");
  const app = definition ? portalApp(definition) : null;
  if (!app) throw new Error("App do Webmotors sem credenciais no ambiente");

  const connection = await getConnection(tenantId, "webmotors");
  if (!connection || connection.status !== "conectado") {
    throw new Error("Webmotors desconectado nesta revenda");
  }
  const credentials = await readCredentials(connection);
  const token = await webmotorsToken(app, {
    username: credentials.username ?? "",
    password: credentials.password ?? "",
  });
  const detail = await fetchLeadDetail(app, token, notice);
  return registerPortalLead(tenantId, parseLeadDetail(detail, notice));
}

/** Aviso guardado → lead. Marca o evento como processado ou com o erro. */
export async function processWebmotorsEvent(event: WebhookEvent): Promise<RegisterOutcome> {
  const db = await getDb();
  const notice = parseLeadNotice(event.payload);
  if (!event.tenantId || !notice) {
    await db
      .update(webhookEvents)
      .set({ processedAt: new Date(), error: "aviso sem revenda ou sem id de lead" })
      .where(eq(webhookEvents.id, event.id));
    return "ignored";
  }

  try {
    const outcome = await ingestWebmotorsLead(event.tenantId, notice);
    await db
      .update(webhookEvents)
      .set({ processedAt: new Date(), error: null })
      .where(eq(webhookEvents.id, event.id));
    return outcome;
  } catch (error) {
    // sem processedAt: a sincronização e o reenvio do Webmotors tentam de novo
    const message = error instanceof Error ? error.message : String(error);
    await db.update(webhookEvents).set({ error: message }).where(eq(webhookEvents.id, event.id));
    throw error;
  }
}

/** Avisos que falharam (senha trocada, API fora do ar) entram de novo aqui. */
export async function retryWebmotorsLeads(tenantId: string): Promise<LeadIngestReport> {
  const report = emptyIngestReport();
  const db = await getDb();
  const pending = await db
    .select()
    .from(webhookEvents)
    .where(
      and(
        eq(webhookEvents.provider, "webmotors"),
        eq(webhookEvents.tenantId, tenantId),
        isNull(webhookEvents.processedAt),
      ),
    )
    .orderBy(asc(webhookEvents.receivedAt))
    .limit(BATCH);

  for (const event of pending) {
    try {
      report[await processWebmotorsEvent(event)] += 1;
    } catch {
      report.failed += 1;
    }
  }
  return report;
}
