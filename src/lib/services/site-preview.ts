import { cookies } from "next/headers";
import { composeTheme, type ThemeTokens } from "@carbud/site-kit/contract";
import { findTemplateManifest } from "@carbud/site-kit/manifests";
import { SITE_PREVIEW_COOKIE } from "@/lib/client/site-preview";
import { siteSettingsSchema } from "@/lib/validation/site";

/**
 * Prévia do site com template e cores ainda não salvos.
 *
 * O painel grava a escolha num cookie e abre `/r/[slug]`; o site lê o cookie
 * e se pinta com ela. Cookie, e não query string, porque a pessoa navega pela
 * prévia — estoque, página do carro — e a escolha precisa ir junto em cada
 * link sem que os templates saibam que prévia existe.
 *
 * Só quem tem o cookie vê: é o próprio navegador de quem escolheu, então
 * nada do que vem dele precisa ser segredo, só precisa ser válido.
 */
export type SitePreview = { templateId: string; theme: Partial<ThemeTokens> };

export function parseSitePreview(raw: string | undefined, slug: string): SitePreview | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object" || (data as { slug?: unknown }).slug !== slug) return null;

  const parsed = siteSettingsSchema.safeParse({
    templateId: (data as { templateId?: unknown }).templateId,
    theme: (data as { theme?: unknown }).theme,
  });
  if (!parsed.success || !parsed.data.templateId) return null;

  // template "em breve" não tem código: a prévia cairia no padrão e enganaria
  if (findTemplateManifest(parsed.data.templateId)?.status !== "ready") return null;

  return { templateId: parsed.data.templateId, theme: parsed.data.theme ?? {} };
}

export async function readSitePreview(slug: string): Promise<SitePreview | null> {
  const store = await cookies();
  return parseSitePreview(store.get(SITE_PREVIEW_COOKIE)?.value, slug);
}

/** O site como ficaria salvo, com o tema montado nas mesmas três camadas. */
export function applySitePreview<T extends { templateId: string; theme: ThemeTokens }>(
  site: T,
  preview: SitePreview | null,
): T {
  if (!preview) return site;
  return {
    ...site,
    templateId: preview.templateId,
    theme: composeTheme(findTemplateManifest(preview.templateId)?.defaultTheme, preview.theme),
  };
}
