import { and, asc, eq, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { stores, users, vehicles, type Store } from "@/db/schema";
import { badRequest, conflict } from "@/lib/http";
import { slugify } from "@/lib/utils";

export async function listStores(tenantId: string, onlyActive = false): Promise<Store[]> {
  const db = await getDb();
  const where = onlyActive
    ? and(eq(stores.tenantId, tenantId), eq(stores.active, true))
    : eq(stores.tenantId, tenantId);
  return db.select().from(stores).where(where).orderBy(asc(stores.sortOrder), asc(stores.name));
}

export async function getStore(tenantId: string, id: string): Promise<Store | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(stores)
    .where(and(eq(stores.tenantId, tenantId), eq(stores.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

/** Id vindo do formulário: unidade de outra revenda não pode ser gravada. */
export async function assertStoreOfTenant(tenantId: string, id: string | null | undefined) {
  if (!id) return;
  const store = await getStore(tenantId, id);
  if (!store || !store.active) throw badRequest("Unidade inválida.");
}

/** Slug único dentro da revenda; duas unidades podem ter nomes parecidos. */
async function uniqueSlug(tenantId: string, name: string, ignoreId?: string): Promise<string> {
  const db = await getDb();
  const base = slugify(name) || "unidade";

  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const clash = await db
      .select({ id: stores.id })
      .from(stores)
      .where(and(eq(stores.tenantId, tenantId), eq(stores.slug, candidate)))
      .limit(1);
    if (!clash[0] || clash[0].id === ignoreId) return candidate;
  }
  return `${base}-${crypto.randomUUID().slice(0, 6)}`;
}

export type StoreInput = {
  name: string;
  whatsapp?: string | null;
  phone?: string | null;
  email?: string | null;
  addressZip?: string | null;
  addressStreet?: string | null;
  addressNumber?: string | null;
  addressComplement?: string | null;
  addressDistrict?: string | null;
  addressCity?: string | null;
  addressState?: string | null;
  isDefault?: boolean;
  active?: boolean;
  sortOrder?: number;
};

export async function createStore(tenantId: string, input: StoreInput): Promise<string> {
  const db = await getDb();
  const slug = await uniqueSlug(tenantId, input.name);

  const existing = await db
    .select({ id: stores.id })
    .from(stores)
    .where(eq(stores.tenantId, tenantId))
    .limit(1);

  const created = await db
    .insert(stores)
    .values({
      ...input,
      tenantId,
      slug,
      // a primeira unidade é a padrão: alguém precisa receber o que não tem
      // unidade escolhida, senão o primeiro cadastro cai no vazio
      isDefault: input.isDefault ?? !existing[0],
    })
    .returning({ id: stores.id });

  if (created[0] && (input.isDefault ?? !existing[0])) {
    await clearOtherDefaults(tenantId, created[0].id);
  }
  return created[0].id;
}

export async function updateStore(
  tenantId: string,
  id: string,
  input: Partial<StoreInput>,
): Promise<void> {
  const db = await getDb();
  const current = await getStore(tenantId, id);
  if (!current) throw badRequest("Unidade não encontrada");

  const slug = input.name && input.name !== current.name
    ? await uniqueSlug(tenantId, input.name, id)
    : undefined;

  // desativar a unidade padrão deixaria a revenda sem destino para o que não
  // tem unidade escolhida
  if (input.active === false && current.isDefault) {
    throw conflict("Esta é a unidade padrão. Eleja outra como padrão antes de desativá-la.");
  }

  await db
    .update(stores)
    .set({ ...input, ...(slug ? { slug } : {}) })
    .where(and(eq(stores.tenantId, tenantId), eq(stores.id, id)));

  if (input.isDefault) await clearOtherDefaults(tenantId, id);
}

async function clearOtherDefaults(tenantId: string, keepId: string): Promise<void> {
  const db = await getDb();
  await db
    .update(stores)
    .set({ isDefault: false })
    .where(and(eq(stores.tenantId, tenantId), ne(stores.id, keepId)));
}

/**
 * Remove a unidade e solta o que apontava para ela.
 *
 * Veículo e pessoa não são apagados junto: perder estoque porque alguém fechou
 * um pátio seria destruição desproporcional. Eles voltam a ficar sem unidade,
 * que é exatamente o estado de quem nunca usou multiunidade.
 */
export async function deleteStore(tenantId: string, id: string): Promise<void> {
  const db = await getDb();
  const current = await getStore(tenantId, id);
  if (!current) throw badRequest("Unidade não encontrada");
  if (current.isDefault) {
    throw conflict("Esta é a unidade padrão. Eleja outra como padrão antes de excluí-la.");
  }

  await db
    .update(vehicles)
    .set({ storeId: null })
    .where(and(eq(vehicles.tenantId, tenantId), eq(vehicles.storeId, id)));
  await db
    .update(users)
    .set({ storeId: null })
    .where(and(eq(users.tenantId, tenantId), eq(users.storeId, id)));

  await db.delete(stores).where(and(eq(stores.tenantId, tenantId), eq(stores.id, id)));
}

export async function defaultStoreId(tenantId: string): Promise<string | null> {
  const db = await getDb();
  const rows = await db
    .select({ id: stores.id })
    .from(stores)
    .where(and(eq(stores.tenantId, tenantId), eq(stores.isDefault, true)))
    .limit(1);
  return rows[0]?.id ?? null;
}
