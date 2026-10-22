import { describe, expect, it } from "vitest";
import { pickHighlights } from "./portal";

const car = (tenantId: string, n: number) => ({ id: `${tenantId}${n}`, tenantId });

describe("destaques do portal", () => {
  const items = [...Array.from({ length: 10 }, (_, i) => car("a", i)), car("b", 0), car("c", 0), car("d", 0)];

  it("mostra no máximo três, de revendas diferentes quando dá", () => {
    const picked = pickHighlights(items, 0);
    expect(picked).toHaveLength(3);
    expect(new Set(picked.map((c) => c.tenantId)).size).toBe(3);
  });

  it("dá a mesma exposição para cada revenda, não importa quantos destaques ela tem", () => {
    const shown = new Map<string, number>();
    for (let slot = 0; slot < 40; slot++) {
      for (const c of pickHighlights(items, slot)) shown.set(c.tenantId, (shown.get(c.tenantId) ?? 0) + 1);
    }
    expect(new Set(shown.values()).size).toBe(1);
  });

  it("reveza os carros da mesma revenda", () => {
    const fromA = new Set<string>();
    for (let slot = 0; slot < 40; slot++) for (const c of pickHighlights(items, slot)) if (c.tenantId === "a") fromA.add(c.id);
    expect(fromA.size).toBe(10);
  });

  it("com poucos destaques, mostra os que tem sem repetir", () => {
    expect(pickHighlights([car("a", 0)], 7)).toHaveLength(1);
    expect(pickHighlights([car("a", 0), car("a", 1)], 3)).toHaveLength(2);
    expect(pickHighlights([], 0)).toEqual([]);
  });
});
