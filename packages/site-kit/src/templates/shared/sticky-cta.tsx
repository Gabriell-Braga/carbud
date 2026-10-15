import type { SiteLinks, VehicleView } from "../contract";
import { WhatsappIcon } from "./whatsapp-icon";

/**
 * A chamada da ficha presa no rodapé da tela, só no celular.
 *
 * Na ficha o botão de WhatsApp fica no topo, ao lado do preço. Quem rola a
 * galeria, os opcionais e os semelhantes chega no fim decidido e sem botão
 * nenhum à vista. Esta barra acompanha a rolagem com o preço e a ação
 * principal — o mesmo que os grandes classificados fazem, e o que o dono do
 * projeto pediu junto com a barra de filtros (o Figma não a desenha).
 *
 * Sem número de WhatsApp a ação vira o simulador; sem preço, o contato.
 * Ela nunca some, porque a ficha sem chamada nenhuma é uma ficha que não
 * converte.
 *
 * O <style> abaixo empurra o fim da página para cima da barra: sem isso o
 * rodapé terminava escondido atrás dela. Vai no body porque o rodapé é do
 * Shell de cada template, fora do alcance daqui. Não é JavaScript nenhum:
 * é posição fixa e uma regra de CSS.
 */
export function StickyCta({ vehicle, links, storeName }: {
  vehicle: VehicleView;
  links: SiteLinks;
  storeName: string;
}) {
  const whatsapp = links.whatsapp(
    `Olá! Tenho interesse no ${vehicle.title} ${vehicle.yearLabel} anunciado no site da ${storeName}.`,
  );

  const action = whatsapp
    ? {
        href: whatsapp,
        label: "Falar no WhatsApp",
        external: true,
        style: { backgroundColor: "var(--site-whatsapp)", color: "#fff" },
      }
    : !vehicle.priceOnRequest
      ? {
          href: `${links.financing}?veiculo=${vehicle.id}`,
          label: "Simular financiamento",
          external: false,
          style: {
            backgroundColor: "var(--site-primary)",
            color: "var(--site-primary-foreground)",
          },
        }
      : {
          href: links.contact,
          label: "Falar com a loja",
          external: false,
          style: {
            backgroundColor: "var(--site-primary)",
            color: "var(--site-primary-foreground)",
          },
        };

  return (
    <>
      <style>{`@media (max-width: 1023.98px) { body { padding-bottom: 76px; } }`}</style>

      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--site-border)] bg-[var(--site-surface)] px-4 pt-3 lg:hidden"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[11px] text-[var(--site-muted)]">{vehicle.title}</p>
            <p
              className="truncate text-[17px] font-bold leading-tight text-[var(--site-text)]"
              style={{ fontFamily: "var(--site-font-heading)" }}
            >
              {vehicle.priceLabel}
            </p>
          </div>

          <a
            href={action.href}
            data-vehicle-id={vehicle.id}
            target={action.external ? "_blank" : undefined}
            rel={action.external ? "noreferrer" : undefined}
            style={action.style}
            className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-[var(--site-radius)] px-4 text-sm font-medium transition-opacity hover:opacity-90"
          >
            {action.external ? <WhatsappIcon /> : null}
            {action.label}
          </a>
        </div>
      </div>
    </>
  );
}
