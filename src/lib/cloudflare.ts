import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { D1Database, KVNamespace, R2Bucket } from "@cloudflare/workers-types";

export type AppBindings = {
  DB: D1Database;
  CACHE: KVNamespace;
  MEDIA: R2Bucket;
};

/**
 * Acesso único aos bindings do Webflow Cloud.
 * Nunca chamar no top-level de um módulo — só dentro de handlers/funções.
 */
export async function getBindings(): Promise<AppBindings> {
  const { env } = await getCloudflareContext({ async: true });
  return env as unknown as AppBindings;
}

/** Variáveis de ambiente (secrets do painel do Webflow Cloud). */
export function getEnvVar(name: string): string | undefined {
  return process.env[name];
}

export function requireEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  }
  return value;
}
