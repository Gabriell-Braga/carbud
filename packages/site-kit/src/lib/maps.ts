import type { SiteContact, SiteData, SiteStore, VehicleView } from "../templates/contract";

/** O que basta para achar a loja no mapa: o endereço e, se houver, o link manual. */
type Place = Pick<SiteContact, "address"> & { mapsUrl?: string | null };

/**
 * Mapa incorporado a partir do endereco da loja.
 *
 * Usa a incorporacao classica do Google Maps, que aceita uma busca em texto e
 * NAO exige chave de API. A alternativa oficial (Maps Embed API) cobraria uma
 * chave por instalacao e uma conta de faturamento — para mostrar onde fica uma
 * loja, e caro demais em cerimonia.
 *
 * O endereco vai como busca, e nao como coordenada, porque coordenada e o que
 * a revenda NAO tem: ela digita rua, numero e cidade no cadastro.
 */
export function mapsEmbedUrl(contact: Place): string | null {
  const busca = [
    contact.address.street,
    contact.address.number,
    contact.address.district,
    contact.address.city,
    contact.address.state,
    contact.address.zip,
  ]
    .filter(Boolean)
    .join(", ");

  if (!busca) return null;
  return `https://www.google.com/maps?q=${encodeURIComponent(busca)}&output=embed`;
}

/**
 * Link para abrir o mapa fora do site.
 *
 * Montado do mesmo endereco do incorporado, para os dois nunca apontarem para
 * lugares diferentes. Um `mapsUrl` cadastrado a mao vence: e o caso da loja
 * que tem ficha propria no Google e quer levar para ela, com foto e avaliacao,
 * em vez de uma busca por endereco.
 */
export function mapsLinkUrl(contact: Place): string | null {
  if (contact.mapsUrl) return contact.mapsUrl;

  const embed = mapsEmbedUrl(contact);
  if (!embed) return null;
  return embed.replace("&output=embed", "");
}

/** Unidade do carro, ou null quando ele não tem uma (ou a revenda é loja única). */
export function vehicleStore(site: SiteData, vehicle: VehicleView): SiteStore | null {
  if (!vehicle.storeId) return null;
  return site.stores?.find((store) => store.id === vehicle.storeId) ?? null;
}

/** Onde a ficha diz que o carro está: na unidade dele, senão na loja. */
export function vehiclePlace(site: SiteData, vehicle: VehicleView): Place {
  const store = vehicleStore(site, vehicle);
  return store?.address.full ? { address: store.address } : site.contact;
}
