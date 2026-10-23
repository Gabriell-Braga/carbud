import { MapPin } from "lucide-react";
import type { SiteData } from "../contract";
import { mapsLinkUrl } from "../../lib/maps";

/**
 * Uma carta por unidade, na página de contato.
 *
 * Só aparece com duas ou mais lojas: com uma, o bloco "visite nossa loja" já
 * mostra o endereço dela, e repetir o mesmo cartão logo abaixo pareceria erro.
 * Fica em `shared` porque usa só os tokens do tema, que cada template já
 * define — o cartão herda o raio, a cor e a fonte de quem o desenha.
 */
export function StoreCards({ site }: { site: SiteData }) {
  const stores = site.stores ?? [];
  if (stores.length < 2) return null;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {stores.map((store) => {
        const mapa = mapsLinkUrl({ address: store.address });
        const whatsapp = store.whatsappDigits
          ? `https://wa.me/${store.whatsappDigits}?text=${encodeURIComponent(
              `Olá! Vim pelo site da ${site.name} (unidade ${store.name}).`,
            )}`
          : null;
        return (
          <div
            key={store.id}
            className="flex min-w-0 flex-col rounded-[var(--site-radius)] border border-[var(--site-border)] bg-[var(--site-surface)] p-5"
          >
            <p
              className="text-base font-semibold text-[var(--site-text)]"
              style={{ fontFamily: "var(--site-font-heading)" }}
            >
              {store.name}
            </p>
            {store.address.full ? (
              <p className="mt-2 text-[13px] leading-relaxed text-[var(--site-muted)]">
                {store.address.full}
              </p>
            ) : null}
            {store.phone ? (
              <a
                href={`tel:${store.phone.replace(/\D/g, "")}`}
                className="mt-2 text-[13px] text-[var(--site-text)] hover:text-[var(--site-primary)]"
              >
                {store.phone}
              </a>
            ) : null}
            <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-4 text-[13px] font-medium">
              {whatsapp ? (
                <a
                  href={whatsapp}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[var(--site-primary)] hover:underline"
                >
                  WhatsApp da unidade
                </a>
              ) : null}
              {mapa ? (
                <a
                  href={mapa}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[var(--site-primary)] hover:underline"
                >
                  <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                  Ver no mapa
                </a>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
