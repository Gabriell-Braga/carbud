import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { leads, vehicles, type VehicleStatus } from "@/db/schema";
import { badRequest, clientIp, jsonOk, notFound, tooManyRequests, withApi } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { getTenantCoreBySlug, isPublicSiteAvailable } from "@/lib/tenant/service";
import { onlyDigits } from "@/lib/utils";
import { publicLeadSchema } from "@/lib/validation/leads";

import { listStages, pickAssignee, recordLeadEvent } from "@/lib/services/crm";
import { dispatchTenantEvent } from "@/lib/services/api-access";
import { notifyNewLead } from "@/lib/services/notifications";
import { newEventId } from "@/lib/tracking/event";
import { trackInBackground } from "@/lib/tracking/dispatch";
import { composeLeadMessage, createIntentRecord } from "@/lib/services/public-lead";

export const dynamic = "force-dynamic";

const PUBLIC_STATUSES: VehicleStatus[] = ["available", "reserved"];

/** Endpoint público do formulário de contato dos sites das revendas. */
export const POST = withApi(async (request: Request) => {
  const parsed = publicLeadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw badRequest("Dados inválidos", parsed.error.issues);
  const input = parsed.data;

  // honeypot preenchido: responde ok para não ensinar o bot
  if (input.website) return jsonOk({ received: true });

  const ip = clientIp(request) ?? "desconhecido";
  const byIp = await rateLimit(`lead:ip:${ip}`, 10, 3600);
  const byPhone = await rateLimit(`lead:phone:${onlyDigits(input.phone)}`, 5, 3600);
  if (!byIp.allowed || !byPhone.allowed) throw tooManyRequests();

  const tenant = await getTenantCoreBySlug(input.tenantSlug);
  if (!tenant || !isPublicSiteAvailable(tenant)) throw notFound("Site indisponível");

  const db = await getDb();
  let vehicleLabel: string | null = null;
  let vehicleId: string | null = null;
  let vehiclePriceCents = 0;

  if (input.vehicleId) {
    const found = await db
      .select({
        id: vehicles.id,
        brand: vehicles.brand,
        model: vehicles.model,
        version: vehicles.version,
        yearModel: vehicles.yearModel,
        priceCents: vehicles.priceCents,
      })
      .from(vehicles)
      .where(
        and(
          eq(vehicles.tenantId, tenant.id),
          eq(vehicles.id, input.vehicleId),
          inArray(vehicles.status, PUBLIC_STATUSES),
        ),
      )
      .limit(1);

    if (found[0]) {
      vehicleId = found[0].id;
      vehiclePriceCents = found[0].priceCents;
      vehicleLabel = [found[0].brand, found[0].model, found[0].version, found[0].yearModel]
        .filter(Boolean)
        .join(" ");
    }
  }

  // etapa inicial e responsável saem das regras da revenda; sem funil montado
  // ou sem rodízio ligado, ficam nulos e o lead cai na lista como antes
  const stages = await listStages(tenant.id);
  const firstStage = stages.find((stage) => stage.kind === "open") ?? stages[0] ?? null;
  const assignedToUserId = await pickAssignee(tenant.id, null);

  const created = await db
    .insert(leads)
    .values({
      tenantId: tenant.id,
      vehicleId,
      vehicleLabel,
      name: input.name,
      phone: input.phone,
      email: input.email || null,
      message: composeLeadMessage(input),
      source: "form",
      status: "new",
      stageId: firstStage?.id ?? null,
      assignedToUserId,
      utm: input.utm,
    })
    .returning({ id: leads.id });

  const leadId = created[0].id;

  await recordLeadEvent({
    tenantId: tenant.id,
    leadId,
    type: "created",
    body: vehicleLabel ? `Lead pelo site, sobre ${vehicleLabel}.` : "Lead pelo site.",
    metadata: { source: "form", stage: firstStage?.name ?? null },
  });

  /*
   * A ficha de trabalho que nasce junto: proposta de financiamento ou
   * avaliação, conforme o formulário. Falhar aqui não pode desfazer o lead —
   * ele já está salvo, e é ele que não pode se perder.
   */
  const intent = await createIntentRecord(tenant.id, input, {
    id: vehicleId,
    label: vehicleLabel,
    priceCents: vehiclePriceCents,
  }).catch(() => null);

  if (intent) {
    await recordLeadEvent({
      tenantId: tenant.id,
      leadId,
      type: "note",
      body:
        intent.kind === "financing"
          ? "Simulação de financiamento criada em rascunho a partir do site."
          : "Avaliação criada em rascunho a partir do site.",
      metadata: { [intent.kind]: intent.id },
    });
  }

  /*
   * Conversão para as plataformas de mídia, pelo servidor.
   *
   * Vai com o `eventId` que o navegador usou no pixel: é o que faz a Meta
   * entender que o evento do site e o daqui são o mesmo. Se o navegador não
   * mandou (JavaScript bloqueado, formulário sem o script), um id novo entra
   * no lugar — melhor uma conversão contada uma vez do que nenhuma.
   */
  await trackInBackground(tenant.id, {
    name: "lead",
    eventId: input.tracking?.eventId || newEventId("lead"),
    value: vehiclePriceCents > 0 ? vehiclePriceCents / 100 : null,
    user: {
      email: input.email || null,
      phone: input.phone,
      name: input.name,
      ip: clientIp(request),
      userAgent: request.headers.get("user-agent"),
      fbp: input.tracking?.fbp ?? null,
      fbc: input.tracking?.fbc ?? null,
      ga4ClientId: input.tracking?.gaClientId ?? null,
    },
    content: vehicleId
      ? { id: vehicleId, name: vehicleLabel }
      : undefined,
    sourceUrl: input.tracking?.pageUrl ?? input.utm?.page ?? null,
  });

  // e-mail para quem atende, quando a revenda ligou o aviso
  await notifyNewLead({
    tenantId: tenant.id,
    lead: {
      id: leadId,
      name: input.name,
      phone: input.phone,
      email: input.email || null,
      message: composeLeadMessage(input),
      vehicleLabel,
      assignedToUserId,
    },
    origin: "site",
  });

  // avisa quem integrou, sem poder derrubar a captação do lead
  await dispatchTenantEvent(tenant.id, "lead.created", {
    id: leadId,
    name: input.name,
    phone: input.phone,
    email: input.email || null,
    vehicle: vehicleLabel,
    source: "form",
  });

  return jsonOk({ id: leadId, received: true });
});
