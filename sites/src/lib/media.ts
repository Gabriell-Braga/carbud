import type { SiteData, VehicleView } from "@carbud/site-kit/contract";

/**
 * Traz as imagens para o dominio da revenda.
 *
 * O painel monta as URLs das fotos com o proprio prefixo — `/api/media/<chave>`,
 * possivelmente atras do mount path do Webflow Cloud. Coladas aqui do jeito que
 * vem, elas apontariam para um caminho que este app nao serve, e a pagina
 * ficaria sem foto nenhuma.
 *
 * Em vez de reescrever para o endereco absoluto do painel — que colocaria o
 * dominio da PLATAFORMA dentro do codigo-fonte do site do CLIENTE —, tudo passa
 * a sair de `/media/...`, que o `rewrites()` do next.config encaminha.
 *
 * O corte e pela ultima ocorrencia de `/api/media/` para o mount path, qualquer
 * que seja ele, sumir junto.
 */
const MARCA = "/api/media/";

export function localMedia(url: string | null): string | null {
  if (!url) return null;
  const corte = url.lastIndexOf(MARCA);
  if (corte < 0) return url;
  return `/media/${url.slice(corte + MARCA.length)}`;
}

export function vehicleWithLocalMedia(vehicle: VehicleView): VehicleView {
  return {
    ...vehicle,
    coverUrl: localMedia(vehicle.coverUrl),
    photos: vehicle.photos.map((photo) => ({
      ...photo,
      thumb: localMedia(photo.thumb) ?? photo.thumb,
      card: localMedia(photo.card) ?? photo.card,
      full: localMedia(photo.full) ?? photo.full,
    })),
  };
}

export function siteWithLocalMedia(site: SiteData): SiteData {
  return {
    ...site,
    logoUrl: localMedia(site.logoUrl),
    /*
     * O favicon passa pela MESMA reescrita da logo.
     *
     * Esqueci dele ao adicionar o campo, e a tag saiu apontando para
     * /app/api/media/... — o caminho do painel, que neste dominio nao existe.
     * A aba ficava sem icone e nada no build reclamava.
     */
    faviconUrl: localMedia(site.faviconUrl),
    faviconDarkUrl: localMedia(site.faviconDarkUrl),
    banners: site.banners.map((banner) => ({
      ...banner,
      imageUrl: localMedia(banner.imageUrl),
      imageUrlMobile: localMedia(banner.imageUrlMobile),
    })),
  };
}
