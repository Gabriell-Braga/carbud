import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { platformSettings } from "@/db/schema";
import { cached, invalidate } from "@/lib/cache";
import {
  EMAIL_COPY_FIELDS,
  EMAIL_TEMPLATES,
  type EmailCopy,
  type EmailCopyOverrides,
  type EmailTemplateKey,
} from "./templates";

/**
 * Onde moram os textos de e-mail reescritos no Painel Geral.
 *
 * Fica numa coluna JSON de `platform_settings`, e não numa tabela, porque são
 * quatro modelos de uma instalação — não há o que consultar, só ler inteiro.
 * Fora do `index.ts` de propósito: ele é importado pela tela de edição, que
 * roda no navegador e não pode puxar o banco.
 */

const CACHE_KEY = "platform:email-templates";
const TTL = 300;

export async function getEmailCopyOverrides(): Promise<EmailCopyOverrides> {
  return cached(CACHE_KEY, TTL, async () => {
    const db = await getDb();
    const rows = await db
      .select({ emailTemplates: platformSettings.emailTemplates })
      .from(platformSettings)
      .where(eq(platformSettings.id, "default"))
      .limit(1);
    return rows[0]?.emailTemplates ?? {};
  });
}

/**
 * Os textos gravados de um modelo, para passar ao montador.
 *
 * Falha de leitura não pode segurar o e-mail: sem o banco, sai o padrão — um
 * aviso de lead com o texto de fábrica é melhor do que aviso nenhum.
 */
export async function getEmailCopy(key: EmailTemplateKey): Promise<Partial<EmailCopy> | null> {
  try {
    return (await getEmailCopyOverrides())[key] ?? null;
  } catch (error) {
    console.error("[email] não consegui ler os textos gravados", error);
    return null;
  }
}

/**
 * Grava um modelo guardando só o que difere do padrão.
 *
 * Assim, quando o texto de fábrica melhora num deploy, os campos que ninguém
 * tocou acompanham. `null` volta o modelo inteiro ao padrão.
 */
export async function saveEmailCopy(
  key: EmailTemplateKey,
  copy: EmailCopy | null,
): Promise<Partial<EmailCopy> | null> {
  const db = await getDb();
  const rows = await db
    .select({ id: platformSettings.id, emailTemplates: platformSettings.emailTemplates })
    .from(platformSettings)
    .where(eq(platformSettings.id, "default"))
    .limit(1);

  const all: EmailCopyOverrides = { ...(rows[0]?.emailTemplates ?? {}) };
  const defaults = EMAIL_TEMPLATES[key].defaults;

  const diff: Partial<EmailCopy> = {};
  if (copy) {
    for (const field of EMAIL_COPY_FIELDS) {
      const value = copy[field].trim();
      if (value && value !== defaults[field]) diff[field] = value;
    }
  }

  if (Object.keys(diff).length > 0) all[key] = diff;
  else delete all[key];

  if (rows[0]) {
    await db
      .update(platformSettings)
      .set({ emailTemplates: all })
      .where(eq(platformSettings.id, "default"));
  } else {
    await db.insert(platformSettings).values({ id: "default", emailTemplates: all });
  }

  await invalidate(CACHE_KEY);
  return all[key] ?? null;
}
