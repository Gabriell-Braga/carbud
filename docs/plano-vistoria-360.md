# Vistoriado e Visão 360° (painel + Portal Carbud)

Feito em outubro de 2026. Este arquivo registra as regras e o que ficou para depois.

## Vistoriado

- **Regra (`isInspected`, `src/lib/services/vehicles.ts`):** laudo em PDF anexado, resultado aprovado (com ou sem ressalvas) e data com menos de um ano. Selo sem documento não existe; laudo reprovado fica guardado para a loja, sem selo.
- **Dados:** colunas `inspection_*` em `vehicles` (migration 0026). Ficaram no próprio veículo, e não numa tabela, porque é sempre um laudo por carro.
- **Painel:** card "Vistoria" na ficha do veículo (`admin/estoque/[id]/inspection-360.tsx`), rota `POST/DELETE /api/admin/vehicles/[id]/inspection`. O PDF é servido por `/api/media` sem a CSP `sandbox`, porque o leitor de PDF do Chrome não abre com ela.
- **API pública:** `portal/vehicles` aceita `vistoriado=1` e devolve `inspected`; a ficha (`/api/public/site/[slug]/vehicles/[slug]`) devolve `inspection` com o link do laudo.

## Visão 360°

- **Dados:** tabela `vehicle_media_360`, uma linha por tipo: `spin` (giro externo, 24 a 72 quadros em ordem) ou `pano` (panorâmica 2:1 do interior). Fica fora de `vehicle_photos` para capa, contagem, card e feed dos portais não precisarem aprender a ignorar quadro de giro.
- **Painel:** card "Visão 360°" com prévia do giro por slider. A ordem dos quadros é a do nome do arquivo. O navegador reduz antes do envio (quadro 1280 px, panorâmica 4096 px) e não conta no limite de fotos do plano.
- **API pública:** `portal/vehicles` aceita `visao360=1` e devolve `has360`; a ficha devolve `spin` e `pano`.
- **Portal:** `components/viewer-360.tsx`. O giro troca o quadro conforme arrasta e só baixa os quadros quando a pessoa abre. A panorâmica é rolagem de fundo em cilindro, sem WebGL nem dependência.

## Para depois

- **Templates dos sites das revendas:** selos e visualizador. O `VehicleView` do site-kit já traz `inspection`, `spin` e `pano`; `sites/src/lib/media.ts` precisa reescrever essas URLs quando os templates passarem a usar.
- **Portais (OLX, Webmotors):** mandar o laudo junto se a API deles tiver campo para isso.
- **Panorâmica esférica de verdade** (teto e chão sem distorção): só se a cilíndrica incomodar. Nesse caso, carregar `@photo-sphere-viewer/core` sob demanda.
