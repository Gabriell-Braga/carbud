import { and, eq, gte, isNotNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { leadEvents, leadTasks, leads, users } from "@/db/schema";
import { brazilIsoDate } from "@/lib/gateway/brazil-date";
import { DAY_MS, type Period } from "@/lib/services/reports";

type Message = { leadId: string; direction: "in" | "out"; at: number };

/**
 * Tempo até a primeira resposta, em minutos, de cada vez que o cliente
 * chamou e esperou.
 *
 * A espera começa na primeira mensagem do cliente sem resposta pendente e
 * termina na primeira mensagem nossa depois dela. Três mensagens seguidas do
 * cliente são uma espera só — contar cada uma inflaria a média com o mesmo
 * atraso três vezes. O que ainda está esperando volta à parte, como fila.
 */
export function responseTimes(messages: Message[]): { minutes: number[]; waiting: number } {
  const byLead = new Map<string, Message[]>();
  for (const message of messages) {
    const list = byLead.get(message.leadId) ?? [];
    list.push(message);
    byLead.set(message.leadId, list);
  }

  const minutes: number[] = [];
  let waiting = 0;
  for (const list of byLead.values()) {
    list.sort((a, b) => a.at - b.at);
    let since: number | null = null;
    for (const message of list) {
      if (message.direction === "in") {
        since ??= message.at;
      } else if (since !== null) {
        minutes.push((message.at - since) / 60_000);
        since = null;
      }
    }
    if (since !== null) waiting += 1;
  }
  return { minutes, waiting };
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export type AttendanceReport = {
  conversas: number;
  novosContatos: number;
  recebidas: number;
  enviadas: number;
  /** Mediana, não média: uma conversa esquecida no fim de semana não pode esconder o dia a dia. */
  medianaRespostaMin: number | null;
  aguardando: number;
  porAtendente: { nome: string; conversas: number; mensagens: number }[];
  porDia: { dia: string; conversas: number }[];
  motivosPerda: { motivo: string; total: number }[];
  agenda: { nome: string; feitas: number; atrasadas: number }[];
};

/**
 * Atendimento pelo WhatsApp e disciplina da equipe no período.
 *
 * ponytail: lê as mensagens do período e calcula no Worker. Até algumas dezenas
 * de milhares de mensagens isso é instantâneo; acima, mover o cálculo do tempo
 * de resposta para uma consulta com janela no SQL.
 */
export async function buildAttendanceReport(tenantId: string, periodo: Period): Promise<AttendanceReport> {
  const db = await getDb();
  const now = Date.now();
  const since = new Date(now - periodo * DAY_MS);

  const events = await db
    .select({
      leadId: leadEvents.leadId,
      direction: leadEvents.direction,
      at: leadEvents.createdAt,
      userName: leadEvents.userName,
      userId: leadEvents.userId,
    })
    .from(leadEvents)
    .where(
      and(
        eq(leadEvents.tenantId, tenantId),
        eq(leadEvents.type, "whatsapp"),
        isNotNull(leadEvents.direction),
        gte(leadEvents.createdAt, since),
      ),
    )
    .limit(50_000);

  const messages = events.map((event) => ({
    leadId: event.leadId,
    direction: event.direction as "in" | "out",
    at: event.at.getTime(),
  }));
  const times = responseTimes(messages);

  const inbound = messages.filter((message) => message.direction === "in");
  const conversationLeads = new Set(inbound.map((message) => message.leadId));

  // por dia: quantos clientes diferentes chamaram naquele dia (Brasília)
  const perDay = new Map<string, Set<string>>();
  for (const message of inbound) {
    const day = brazilIsoDate(new Date(message.at));
    const set = perDay.get(day) ?? new Set<string>();
    set.add(message.leadId);
    perDay.set(day, set);
  }

  // só mensagem de gente: campanha e robô não são atendimento
  const perAttendant = new Map<string, { conversas: Set<string>; mensagens: number }>();
  for (const event of events) {
    if (event.direction !== "out" || !event.userId) continue;
    const name = event.userName ?? "Sem nome";
    const entry = perAttendant.get(name) ?? { conversas: new Set<string>(), mensagens: 0 };
    entry.conversas.add(event.leadId);
    entry.mensagens += 1;
    perAttendant.set(name, entry);
  }

  const [newContacts, lostReasons, tasks] = await Promise.all([
    db
      .select({ total: sql<number>`count(*)` })
      .from(leads)
      .where(and(eq(leads.tenantId, tenantId), eq(leads.source, "whatsapp"), gte(leads.createdAt, since))),
    db
      .select({ motivo: leads.lostReason, total: sql<number>`count(*)` })
      .from(leads)
      .where(and(eq(leads.tenantId, tenantId), isNotNull(leads.lostReason), gte(leads.updatedAt, since)))
      .groupBy(leads.lostReason),
    db
      .select({
        nome: users.name,
        feitas: sql<number>`sum(case when ${leadTasks.status} = 'done' and ${leadTasks.doneAt} >= ${since.getTime()} then 1 else 0 end)`,
        atrasadas: sql<number>`sum(case when ${leadTasks.status} = 'pending' and ${leadTasks.dueAt} < ${now} then 1 else 0 end)`,
      })
      .from(leadTasks)
      .innerJoin(users, eq(users.id, leadTasks.assignedToUserId))
      .where(eq(leadTasks.tenantId, tenantId))
      .groupBy(users.id),
  ]);

  return {
    conversas: conversationLeads.size,
    novosContatos: Number(newContacts[0]?.total ?? 0),
    recebidas: inbound.length,
    enviadas: messages.length - inbound.length,
    medianaRespostaMin: median(times.minutes),
    aguardando: times.waiting,
    porAtendente: [...perAttendant.entries()]
      .map(([nome, entry]) => ({ nome, conversas: entry.conversas.size, mensagens: entry.mensagens }))
      .sort((a, b) => b.conversas - a.conversas),
    porDia: [...perDay.entries()]
      .map(([dia, set]) => ({ dia, conversas: set.size }))
      .sort((a, b) => a.dia.localeCompare(b.dia)),
    motivosPerda: lostReasons
      .map((row) => ({ motivo: row.motivo ?? "outro", total: Number(row.total) }))
      .sort((a, b) => b.total - a.total),
    agenda: tasks
      .map((row) => ({ nome: row.nome, feitas: Number(row.feitas ?? 0), atrasadas: Number(row.atrasadas ?? 0) }))
      .filter((row) => row.feitas + row.atrasadas > 0)
      .sort((a, b) => b.atrasadas - a.atrasadas),
  };
}

/** "45 min", "2 h 10 min", "3 dias" — o tamanho que a gerência lê de relance. */
export function formatWait(minutes: number | null): string {
  if (minutes === null) return "—";
  if (minutes < 1) return "menos de 1 min";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  if (minutes < 24 * 60) {
    const hours = Math.floor(minutes / 60);
    const rest = Math.round(minutes % 60);
    return rest ? `${hours} h ${rest} min` : `${hours} h`;
  }
  return `${Math.round(minutes / (24 * 60))} dia(s)`;
}
