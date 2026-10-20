import type { z } from "zod";

/**
 * Valida o corpo de um PATCH e devolve só os campos que vieram nele.
 *
 * O Zod 4 aplica `.default()` mesmo dentro de `.partial()`. Sem este filtro,
 * editar o título de um banner reativava o banner e o jogava para a posição
 * 0, e salvar só a carroceria de um carro voltava o status para rascunho.
 * Campo ausente significa "não mexer"; o default só vale na criação.
 */
export function parsePatch<T extends z.ZodObject>(schema: T, raw: unknown) {
  const parsed = schema.partial().safeParse(raw);
  if (!parsed.success) return parsed;
  const sent = raw && typeof raw === "object" ? raw : {};
  const data = Object.fromEntries(
    Object.entries(parsed.data).filter(([key]) => key in sent),
  ) as Partial<z.infer<T>>;
  return { success: true as const, data };
}
