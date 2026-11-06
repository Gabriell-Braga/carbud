import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { leadTasks, leads, users, type TaskKind, type TaskStatus } from "@/db/schema";
import { TASK_KIND_LABELS } from "@/lib/catalog/labels";
import { brazilIsoDate } from "@/lib/gateway/brazil-date";
import { badRequest, notFound } from "@/lib/http";
import { recordLeadEvent } from "@/lib/services/crm";

export type AgendaBucket = "overdue" | "today" | "upcoming";

/**
 * Em que pilha a tarefa aparece.
 *
 * "Hoje" é o dia no relógio de Brasília: o runtime roda em UTC e, sem isso,
 * a ligação marcada para 22h sumiria de "hoje" às 21h.
 */
export function agendaBucket(dueAt: Date, now: Date): AgendaBucket {
  if (dueAt.getTime() < now.getTime()) return "overdue";
  return brazilIsoDate(dueAt) === brazilIsoDate(now) ? "today" : "upcoming";
}

const DATE_TIME = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
  timeStyle: "short",
});

/** Data e hora como a loja lê, para o texto que vai à linha do tempo. */
export function formatBrazilDateTime(date: Date): string {
  return DATE_TIME.format(date);
}

type Actor = { userId: string | null; userName: string | null };

async function assertTenantUser(tenantId: string, userId: string) {
  const rows = await (await getDb())
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)))
    .limit(1);
  if (!rows[0]) throw badRequest("Responsável inválido");
}

export async function listLeadTasks(tenantId: string, leadId: string) {
  const db = await getDb();
  return db
    .select({
      id: leadTasks.id,
      kind: leadTasks.kind,
      dueAt: leadTasks.dueAt,
      note: leadTasks.note,
      status: leadTasks.status,
      assignedToUserId: leadTasks.assignedToUserId,
      assignedToName: users.name,
    })
    .from(leadTasks)
    .leftJoin(users, eq(users.id, leadTasks.assignedToUserId))
    .where(
      and(
        eq(leadTasks.tenantId, tenantId),
        eq(leadTasks.leadId, leadId),
        eq(leadTasks.status, "pending"),
      ),
    )
    .orderBy(asc(leadTasks.dueAt));
}

export async function createLeadTask(
  tenantId: string,
  leadId: string,
  input: { kind: TaskKind; dueAt: Date; note?: string | null; assignedToUserId?: string | null },
  actor: Actor,
) {
  const db = await getDb();
  const lead = await db
    .select({ assignedToUserId: leads.assignedToUserId })
    .from(leads)
    .where(and(eq(leads.tenantId, tenantId), eq(leads.id, leadId)))
    .limit(1);
  if (!lead[0]) throw notFound("Lead não encontrado");

  // sem escolha explícita, a tarefa é de quem atende o lead; sem ninguém
  // atendendo, de quem marcou — tarefa sem dono não aparece na agenda de ninguém
  const assignee = input.assignedToUserId ?? lead[0].assignedToUserId ?? actor.userId;
  if (assignee) await assertTenantUser(tenantId, assignee);

  const created = await db
    .insert(leadTasks)
    .values({
      tenantId,
      leadId,
      kind: input.kind,
      dueAt: input.dueAt,
      note: input.note || null,
      assignedToUserId: assignee,
      createdByUserId: actor.userId,
    })
    .returning({ id: leadTasks.id });

  await recordLeadEvent({
    tenantId,
    leadId,
    type: input.kind === "visit" || input.kind === "test_drive" ? "visit" : "note",
    body: `Agendado: ${TASK_KIND_LABELS[input.kind]} em ${formatBrazilDateTime(input.dueAt)}.${
      input.note ? `\n${input.note}` : ""
    }`,
    ...actor,
  });

  return created[0].id;
}

/**
 * Conclui, cancela ou remarca.
 *
 * Concluir e cancelar escrevem na linha do tempo; remarcar só move a data —
 * o histórico conta o que aconteceu, e "mudou de 10h para 11h" não aconteceu
 * com o cliente.
 */
export async function updateLeadTask(
  tenantId: string,
  taskId: string,
  input: {
    status?: Exclude<TaskStatus, "pending">;
    dueAt?: Date;
    note?: string | null;
    assignedToUserId?: string | null;
    outcome?: string | null;
  },
  actor: Actor,
) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(leadTasks)
    .where(and(eq(leadTasks.tenantId, tenantId), eq(leadTasks.id, taskId)))
    .limit(1);
  const task = rows[0];
  if (!task) throw notFound("Tarefa não encontrada");
  if (task.status !== "pending") throw badRequest("Esta tarefa já foi encerrada");

  if (input.assignedToUserId) await assertTenantUser(tenantId, input.assignedToUserId);

  await db
    .update(leadTasks)
    .set({
      ...(input.dueAt ? { dueAt: input.dueAt } : {}),
      ...(input.note !== undefined ? { note: input.note || null } : {}),
      ...(input.assignedToUserId !== undefined ? { assignedToUserId: input.assignedToUserId } : {}),
      ...(input.status ? { status: input.status, doneAt: new Date() } : {}),
    })
    .where(and(eq(leadTasks.tenantId, tenantId), eq(leadTasks.id, taskId)));

  if (input.status) {
    const verb = input.status === "done" ? "Feito" : "Cancelado";
    await recordLeadEvent({
      tenantId,
      leadId: task.leadId,
      type: task.kind === "visit" || task.kind === "test_drive" ? "visit" : "note",
      body: `${verb}: ${TASK_KIND_LABELS[task.kind]} de ${formatBrazilDateTime(task.dueAt)}.${
        input.outcome ? `\n${input.outcome}` : ""
      }`,
      ...actor,
    });
  }

  return task.leadId;
}

/**
 * Tarefas em aberto até `until`, com o lead junto.
 *
 * O filtro de equipe passa pela pessoa: a equipe é de quem atende, não do lead.
 */
export async function listAgenda(
  tenantId: string,
  filters: { userId?: string; teamId?: string; until: Date },
) {
  const db = await getDb();
  const conditions = [
    eq(leadTasks.tenantId, tenantId),
    eq(leadTasks.status, "pending"),
    lte(leadTasks.dueAt, filters.until),
  ];
  if (filters.userId) conditions.push(eq(leadTasks.assignedToUserId, filters.userId));
  if (filters.teamId) {
    const members = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.tenantId, tenantId), eq(users.teamId, filters.teamId)));
    if (members.length === 0) return [];
    conditions.push(
      inArray(
        leadTasks.assignedToUserId,
        members.map((member) => member.id),
      ),
    );
  }

  return db
    .select({
      id: leadTasks.id,
      kind: leadTasks.kind,
      dueAt: leadTasks.dueAt,
      note: leadTasks.note,
      leadId: leads.id,
      leadName: leads.name,
      leadPhone: leads.phone,
      vehicleLabel: leads.vehicleLabel,
      assignedToName: users.name,
    })
    .from(leadTasks)
    .innerJoin(leads, eq(leads.id, leadTasks.leadId))
    .leftJoin(users, eq(users.id, leadTasks.assignedToUserId))
    .where(and(...conditions))
    .orderBy(asc(leadTasks.dueAt))
    .limit(300);
}

/** Atrasadas e de hoje de uma pessoa — o número que o painel inicial mostra. */
export async function agendaCounts(tenantId: string, userId: string | null, now = new Date()) {
  const db = await getDb();
  const conditions = [eq(leadTasks.tenantId, tenantId), eq(leadTasks.status, "pending")];
  if (userId) conditions.push(eq(leadTasks.assignedToUserId, userId));

  const endOfToday = endOfBrazilDay(now);
  const rows = await db
    .select({
      overdue: sql<number>`sum(case when ${leadTasks.dueAt} < ${now.getTime()} then 1 else 0 end)`,
      today: sql<number>`sum(case when ${leadTasks.dueAt} >= ${now.getTime()} and ${leadTasks.dueAt} <= ${endOfToday.getTime()} then 1 else 0 end)`,
    })
    .from(leadTasks)
    .where(and(...conditions));

  return { overdue: Number(rows[0]?.overdue ?? 0), today: Number(rows[0]?.today ?? 0) };
}

/** Último milissegundo do dia em Brasília (UTC-3 fixo desde 2019, sem horário de verão). */
export function endOfBrazilDay(now: Date): Date {
  const [year, month, day] = brazilIsoDate(now).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 23 + 3, 59, 59, 999));
}
