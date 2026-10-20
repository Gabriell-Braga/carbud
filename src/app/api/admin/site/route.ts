import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { tenantSites, tenants, type TenantTheme } from "@/db/schema";
import { logAuditFor } from "@/lib/audit";
import { requireApiTenant } from "@/lib/auth/guards";
import { badRequest, jsonOk, withApi } from "@/lib/http";
import { invalidateTenantCache } from "@/lib/tenant/service";
import { isTemplateSelectable } from "@carbud/site-kit/manifests";
import { siteSettingsSchema } from "@/lib/validation/site";

export const dynamic = "force-dynamic";

export const PATCH = withApi(async (request: Request) => {
  const context = await requireApiTenant("site:write");

  const parsed = siteSettingsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw badRequest("Dados inválidos", parsed.error.issues);
  const { templateId, clearGtm, gtmCode, theme, ...siteFields } = parsed.data;

  const db = await getDb();

  if (templateId && templateId !== context.tenant.templateId) {
    if (!isTemplateSelectable(templateId)) throw badRequest("Template indisponível");
    await db
      .update(tenants)
      .set({ templateId })
      .where(eq(tenants.id, context.tenant.id));
  }

  const values: Record<string, unknown> = { ...siteFields };
  if (theme) values.theme = theme as TenantTheme;

  /*
   * A data do texto legal é carimbada na mudança, não a cada salvamento.
   *
   * "Atualizado em" é a única pista que o visitante tem de que o documento é
   * recente; reescrevê-la porque alguém mexeu no telefone da loja no mesmo
   * formulário faria a página anunciar uma revisão que não houve.
   */
  if (siteFields.legalPrivacy !== undefined || siteFields.legalTerms !== undefined) {
    const atual = await db
      .select({ privacy: tenantSites.legalPrivacy, terms: tenantSites.legalTerms })
      .from(tenantSites)
      .where(eq(tenantSites.tenantId, context.tenant.id))
      .limit(1);

    const mudou =
      (siteFields.legalPrivacy !== undefined &&
        siteFields.legalPrivacy !== (atual[0]?.privacy ?? null)) ||
      (siteFields.legalTerms !== undefined &&
        siteFields.legalTerms !== (atual[0]?.terms ?? null));

    if (mudou) values.legalUpdatedAt = new Date();
  }
  if (clearGtm) values.gtmCode = null;
  else if (gtmCode !== undefined) values.gtmCode = gtmCode.toUpperCase();

  const existing = await db
    .select({ tenantId: tenantSites.tenantId })
    .from(tenantSites)
    .where(eq(tenantSites.tenantId, context.tenant.id))
    .limit(1);

  if (existing[0]) {
    await db.update(tenantSites).set(values).where(eq(tenantSites.tenantId, context.tenant.id));
  } else {
    await db.insert(tenantSites).values({ tenantId: context.tenant.id, ...values });
  }

  await invalidateTenantCache({ id: context.tenant.id, slug: context.tenant.slug });

  await logAuditFor(
    context,
    {
      action: "site.update",
      entity: "tenant_site",
      entityId: context.tenant.id,
      metadata: { fields: Object.keys(parsed.data) },
    },
    request,
  );

  return jsonOk({ ok: true });
});
