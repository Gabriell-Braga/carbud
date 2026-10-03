import { getPortal } from "@/lib/integrations/portals";
import { mercadoLivreListingTypes } from "./portal-sync";
import { olxBalance } from "./portal-sync-olx";
import { webmotorsModalidades } from "./portal-sync-webmotors";
import { getConnection } from "./portals";

/**
 * Os tipos de anúncio de um portal, no formato que a tela desenha.
 *
 * Cada portal chama de um jeito (listing type no ML, modalidade no
 * Webmotors, destaque na OLX); a tela mostra um painel só. Erro ao consultar
 * o portal não derruba a página: vira uma linha no painel.
 */

export type Quota = { used: number; total: number };

export type AdTypeOption = { id: string; name: string; quota?: Quota };

export type AdTypesInfo =
  | {
      mode: "plan";
      /** Padrão da loja; null = escolhido automaticamente. */
      current: string | null;
      options: AdTypeOption[];
      error: string | null;
    }
  | {
      mode: "bump";
      planName: string | null;
      ads: Quota | null;
      /** Destaques do plano + avulsos. */
      bumps: Quota | null;
      renewsAt: string | null;
      error: string | null;
    };

/** Nomes dos tipos do ML, para quando ele não devolve o rótulo. */
const ML_NAMES: Record<string, string> = {
  free: "Gratuito",
  bronze: "Bronze",
  silver: "Prata",
  gold: "Ouro",
  gold_special: "Clássico",
  gold_premium: "Diamante",
  gold_pro: "Premium",
};

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function portalAdTypes(tenantId: string, portal: string): Promise<AdTypesInfo | null> {
  const definition = getPortal(portal);
  if (!definition?.adTypes) return null;
  const connection = await getConnection(tenantId, portal);
  if (!connection || connection.status !== "conectado") return null;

  if (portal === "mercadolivre") {
    const types = await mercadoLivreListingTypes(tenantId);
    if (!types) return null;
    return {
      mode: "plan",
      current: types.current,
      options: types.available.map((type) => ({
        id: type.id,
        name: type.name || ML_NAMES[type.id] || type.id,
      })),
      error: null,
    };
  }

  if (portal === "webmotors") {
    if (!connection.settings?.stockEmail) return null;
    const current = (connection.settings?.listingTypeId as string | undefined) ?? null;
    try {
      const list = (await webmotorsModalidades(tenantId)) ?? [];
      return {
        mode: "plan",
        current,
        options: list.map((item) => ({
          id: item.code,
          name: item.name,
          ...(item.total > 0 ? { quota: { used: item.used, total: item.total } } : {}),
        })),
        error: null,
      };
    } catch (error) {
      return { mode: "plan", current, options: [], error: message(error) };
    }
  }

  if (portal === "olx") {
    try {
      const balance = await olxBalance(tenantId);
      if (!balance) {
        return {
          mode: "bump",
          planName: null,
          ads: null,
          bumps: null,
          renewsAt: null,
          error:
            "A conta não tem plano profissional com limite na OLX. Destaques dependem de um plano para Empresas.",
        };
      }
      const plan = balance.bumps?.plan;
      const extra = balance.bumps?.additional;
      const bumpsTotal = (plan?.total ?? 0) + (extra?.total ?? 0);
      return {
        mode: "bump",
        planName: balance.name ?? null,
        ads: { used: balance.ads.total - balance.ads.available, total: balance.ads.total },
        bumps: bumpsTotal
          ? {
              used: bumpsTotal - ((plan?.available ?? 0) + (extra?.available ?? 0)),
              total: bumpsTotal,
            }
          : null,
        renewsAt: balance.next_renew_date ?? null,
        error: null,
      };
    } catch (error) {
      return {
        mode: "bump",
        planName: null,
        ads: null,
        bumps: null,
        renewsAt: null,
        error: message(error),
      };
    }
  }

  return null;
}
