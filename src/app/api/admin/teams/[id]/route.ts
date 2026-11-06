import { logAuditFor } from "@/lib/audit";
import { requireApiTenant } from "@/lib/auth/guards";
import { jsonOk, withApi } from "@/lib/http";
import { deleteTeam, listTeams, renameTeam } from "@/lib/services/teams";
import { teamSchema } from "@/lib/validation/users";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const PATCH = withApi(async (request: Request, { params }: Params) => {
  const context = await requireApiTenant("users:write");
  const { id } = await params;
  const { name } = teamSchema.parse(await request.json().catch(() => null));
  await renameTeam(context.tenant.id, id, name);
  await logAuditFor(context, { action: "team.update", entity: "team", entityId: id, metadata: { name } }, request);
  return jsonOk({ teams: await listTeams(context.tenant.id) });
});

export const DELETE = withApi(async (request: Request, { params }: Params) => {
  const context = await requireApiTenant("users:write");
  const { id } = await params;
  await deleteTeam(context.tenant.id, id);
  await logAuditFor(context, { action: "team.delete", entity: "team", entityId: id }, request);
  return jsonOk({ teams: await listTeams(context.tenant.id) });
});
