import { logAuditFor } from "@/lib/audit";
import { requireApiTenant } from "@/lib/auth/guards";
import { jsonOk, withApi } from "@/lib/http";
import { createTeam, listTeams } from "@/lib/services/teams";
import { teamSchema } from "@/lib/validation/users";

export const dynamic = "force-dynamic";

export const GET = withApi(async () => {
  const context = await requireApiTenant("users:read");
  return jsonOk({ teams: await listTeams(context.tenant.id) });
});

export const POST = withApi(async (request: Request) => {
  const context = await requireApiTenant("users:write");
  const { name } = teamSchema.parse(await request.json().catch(() => null));
  const id = await createTeam(context.tenant.id, name);
  await logAuditFor(context, { action: "team.create", entity: "team", entityId: id, metadata: { name } }, request);
  return jsonOk({ id, teams: await listTeams(context.tenant.id) });
});
