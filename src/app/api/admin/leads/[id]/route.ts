import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { leads, users } from "@/db/schema";
import { logAuditFor } from "@/lib/audit";
import { requireApiTenant } from "@/lib/auth/guards";
import { badRequest, jsonOk, notFound, withApi } from "@/lib/http";
import { getLead } from "@/lib/services/leads";
import { setLeadVehicle } from "@/lib/services/portal-leads";
import { listStages, recordLeadEvent } from "@/lib/services/crm";
import { dispatchTenantEvent } from "@/lib/services/api-access";
import { notifyLeadAssigned, notifyLostDeal } from "@/lib/services/notifications";
import { ESCALATED_LOST_REASONS, LOST_REASON_LABELS } from "@/lib/catalog/labels";
import { trackLeadWon } from "@/lib/tracking/sale";
import { leadUpdateSchema } from "@/lib/validation/leads";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const PATCH = withApi(async (request: Request, { params }: Params) => {
  const context = await requireApiTenant("leads:write");
  const { id } = await params;

  const parsed = leadUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw badRequest("Dados inválidos", parsed.error.issues);
  const { vehicleId, lostNote, marketingOptOut, ...input } = parsed.data;

  const existing = await getLead(context.tenant.id, id);
  if (!existing) throw notFound("Lead não encontrado");

  // o responsável precisa ser um usuário da própria revenda
  if (input.assignedToUserId) {
    const owner = await (await getDb())
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, input.assignedToUserId), eq(users.tenantId, context.tenant.id)))
      .limit(1);
    if (!owner[0]) throw badRequest("Responsável inválido");
  }

  // etapa precisa ser do funil desta revenda, senão o lead sumiria do quadro
  const stages = input.stageId || existing.stageId ? await listStages(context.tenant.id) : [];
  if (input.stageId && !stages.some((stage) => stage.id === input.stageId)) {
    throw badRequest("Etapa inválida");
  }

  /*
   * Perder exige motivo. Sem ele o relatório de perdas vira "outro" em tudo e
   * a gerência não sabe onde mexer. Vale pela situação e pela etapa do funil,
   * porque arrastar o card para "Perdido" é o mesmo ato.
   */
  const lostStage = (stageId: string | null | undefined) =>
    stages.find((stage) => stage.id === stageId)?.kind === "lost";
  const wasLost = existing.status === "lost" || lostStage(existing.stageId);
  const becomesLost =
    !wasLost && (input.status === "lost" || (input.stageId !== undefined && lostStage(input.stageId)));
  if (becomesLost && !input.lostReason) {
    throw badRequest("Informe o motivo da perda");
  }

  const db = await getDb();
  const changes = {
    ...input,
    ...(marketingOptOut !== undefined
      ? { marketingOptOutAt: marketingOptOut ? new Date() : null }
      : {}),
  };
  if (Object.keys(changes).length > 0) {
    await db
      .update(leads)
      .set(changes)
      .where(and(eq(leads.tenantId, context.tenant.id), eq(leads.id, id)));
  }

  if (becomesLost && input.lostReason) {
    const reason = LOST_REASON_LABELS[input.lostReason];
    await recordLeadEvent({
      tenantId: context.tenant.id,
      leadId: id,
      type: "status_change",
      body: `Perdido: ${reason}.${lostNote ? `\n${lostNote}` : ""}`,
      userId: context.user.id,
      userName: context.user.name,
    });
    if (ESCALATED_LOST_REASONS.includes(input.lostReason)) {
      await notifyLostDeal({
        tenantId: context.tenant.id,
        lead: existing,
        reason,
        note: lostNote || null,
        seller: { id: context.user.id, name: context.user.name },
      });
    }
  }

  if (input.negotiation) {
    await recordLeadEvent({
      tenantId: context.tenant.id,
      leadId: id,
      type: "proposal",
      body: "Ficha de negociação atualizada.",
      userId: context.user.id,
      userName: context.user.name,
    });
  }

  let sameAdLinked = 0;
  if (vehicleId !== undefined) {
    const linked = await setLeadVehicle(context.tenant.id, existing, vehicleId);
    if (!linked) throw badRequest("Veículo inválido");
    sameAdLinked = linked.sameAdLinked;
    await recordLeadEvent({
      tenantId: context.tenant.id,
      leadId: id,
      type: "note",
      body: linked.vehicleLabel ? `Veículo: ${linked.vehicleLabel}.` : "Veículo desvinculado.",
      userId: context.user.id,
      userName: context.user.name,
    });
  }

  await recordChanges(context, id, existing, input);

  await logAuditFor(
    context,
    { action: "lead.update", entity: "lead", entityId: id, metadata: { ...input, vehicleId } },
    request,
  );

  /*
    * Lead que vira "ganho" é venda: é o sinal que a mídia espera, e o único
    * que carrega quem comprou. Só na PASSAGEM para ganho — salvar de novo um
    * lead que já estava ganho não é uma venda nova.
    */
  if (input.status === "won" && existing.status !== "won") {
    await trackLeadWon(context.tenant.id, { ...existing, ...input });
  }

  /*
   * Passou a ser de alguém: avisa quem recebeu. Só na MUDANÇA — salvar de
   * novo o mesmo responsável não é uma atribuição nova.
   */
  if (input.assignedToUserId && input.assignedToUserId !== existing.assignedToUserId) {
    await notifyLeadAssigned({
      tenantId: context.tenant.id,
      lead: { ...existing, ...input },
      assignedToUserId: input.assignedToUserId,
    });
  }

  await dispatchTenantEvent(context.tenant.id, "lead.updated", { id, ...input });

  return jsonOk({ id, sameAdLinked });
});

/**
 * Escreve na linha do tempo o que mudou.
 *
 * Só o que muda vira evento: salvar sem alterar nada não pode encher o
 * histórico de ruído, senão a conversa de verdade se perde no meio.
 */
async function recordChanges(
  context: Awaited<ReturnType<typeof requireApiTenant>>,
  leadId: string,
  before: { stageId: string | null; assignedToUserId: string | null; status: string },
  input: { stageId?: string | null; assignedToUserId?: string | null; status?: string },
) {
  const tenantId = context.tenant.id;
  const actor = { userId: context.user.id, userName: context.user.name };

  if (input.stageId !== undefined && input.stageId !== before.stageId) {
    const stages = await listStages(tenantId);
    const name = stages.find((stage) => stage.id === input.stageId)?.name ?? "sem etapa";
    await recordLeadEvent({
      tenantId,
      leadId,
      type: "stage_change",
      body: `Movido para ${name}.`,
      ...actor,
    });
  }

  if (
    input.assignedToUserId !== undefined &&
    input.assignedToUserId !== before.assignedToUserId
  ) {
    let name = "ninguém";
    if (input.assignedToUserId) {
      const rows = await (await getDb())
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, input.assignedToUserId))
        .limit(1);
      name = rows[0]?.name ?? "outro usuário";
    }
    await recordLeadEvent({
      tenantId,
      leadId,
      type: "assignment",
      body: `Responsável: ${name}.`,
      ...actor,
    });
  }

  if (input.status !== undefined && input.status !== before.status) {
    await recordLeadEvent({
      tenantId,
      leadId,
      type: "status_change",
      body: `Situação: ${input.status}.`,
      ...actor,
    });
  }
}
