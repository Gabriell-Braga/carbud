import { jsonOk, notFound, withApi } from "@/lib/http";
import { publicSiteUrl } from "@/lib/services/domains";
import { assertSitesKey } from "@/lib/services/public-api";
import { getSiteData } from "@/lib/services/site";
import { getTenantCoreBySlug, isPublicSiteAvailable } from "@/lib/tenant/service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

/**
 * Tudo que a moldura do site precisa: identidade, contato, tema e textos.
 *
 * Os LINKS não vêm daqui de propósito. No painel eles apontam para
 * `/r/<slug>/estoque`; no site próprio, para `/estoque`. Quem monta a URL é
 * quem sabe onde está — mandar link pronto obrigaria o app dos sites a
 * reescrever cada um deles.
 */
export const GET = withApi(async (request: Request, { params }: Params) => {
  assertSitesKey(request);
  const { slug } = await params;

  const tenant = await getTenantCoreBySlug(slug);
  if (!tenant) throw notFound("Revenda não encontrada");

  const site = await getSiteData(slug);
  if (!site) throw notFound("Revenda não encontrada");

  const { gtmCode, templateId, tracking, ...siteData } = site;
  const canonicalOrigin = await publicSiteUrl(tenant.id);

  return jsonOk(
    {
      site: siteData,
      templateId,
      gtmCode,
      tracking,
      /*
       * Assinatura em atraso não é 404.
       *
       * O app dos sites recebe o aviso e mostra a página de indisponibilidade
       * — neutra, sem expor o motivo. Devolver 404 aqui faria o domínio
       * parecer quebrado, e a revenda abriria chamado de DNS por um problema
       * de cobrança.
       */
      available: isPublicSiteAvailable(tenant),
      /*
       * O domínio oficial, para o app dos sites mandar o `www` (ou qualquer
       * outro endereço cadastrado) para ele. Sem eleger um, o Google indexa
       * o mesmo estoque em dois domínios e trata como conteúdo duplicado.
       */
      canonicalOrigin,
    },
    { headers: { "cache-control": "public, max-age=60, s-maxage=60" } },
  );
});
