import { withBasePath } from "@/lib/paths";

/** Lido no servidor por `src/lib/services/site-preview.ts`. */
export const SITE_PREVIEW_COOKIE = "site_preview";

/*
 * Uma hora basta para olhar o site com calma; depois disso a prévia some
 * sozinha, e quem voltar ao endereço vê o site publicado sem precisar saber
 * que existia uma prévia para desligar.
 */
const MAX_AGE_SECONDS = 60 * 60;

export function openSitePreview(
  slug: string,
  choice: { templateId: string; theme: Record<string, string> },
) {
  const value = encodeURIComponent(JSON.stringify({ slug, ...choice }));
  document.cookie = `${SITE_PREVIEW_COOKIE}=${value}; Max-Age=${MAX_AGE_SECONDS}; Path=/; SameSite=Lax`;
  window.open(withBasePath(`/r/${slug}`), "_blank");
}

export function clearSitePreview() {
  document.cookie = `${SITE_PREVIEW_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
}
