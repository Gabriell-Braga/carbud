# Plano: Vistoriado e Visão 360° (painel + Portal Carbud)

Os dois filtros do Figma do portal ("Vistoriado" e "Visão 360°") ficaram de fora porque o painel não tem o dado. Este plano diz o que falta em cada repositório para eles entrarem sem inventar informação. "Abaixo da FIPE" já está no ar: compara o preço com a FIPE salva no cadastro.

## 1. Vistoriado

**Regra de produto:** só ganha selo quem tem laudo anexado. Marcar "vistoriado" numa caixinha, sem documento, é o tipo de dado que a revenda marca em tudo e o comprador para de confiar.

### Painel (`carbud`)

1. **Migration** `vehicle_inspections` (1:1 com `vehicles`, `tenant_id` obrigatório):
   - `vehicle_id`, `tenant_id`
   - `provider`: texto livre (por exemplo "Dekra", "Supervisão", "Vistoria própria")
   - `inspected_at`: data do laudo
   - `result`: `approved | approved_with_notes | rejected`
   - `report_key`: PDF no R2 (`tenantAssetKey(..., "inspection", uuid, "pdf")`)
   - `notes`: observações curtas, opcional
2. **Upload:** `POST/DELETE /api/admin/vehicles/[id]/inspection` com `requireApiTenant("vehicles:write")`, PDF de até 10 MB. Servido por `/api/media`, que já manda CSP com `sandbox`.
3. **Tela:** bloco "Vistoria" na ficha do veículo (`vehicle-form.tsx`): anexar laudo, empresa, data e resultado. Laudo `rejected` fica guardado para a loja, mas não vira selo.
4. **Regra única:** `isInspected(v) = inspection && result !== "rejected" && inspected_at >= hoje - 12 meses`. Laudo velho não vale para um carro que rodou mais um ano. A regra fica em `src/lib/services/vehicles.ts`, ao lado de `isBelowFipe`, com teste.
5. **API pública:**
   - `portal/vehicles` aceita `vistoriado=1` (subquery `exists` em `vehicle_inspections` com a mesma regra) e devolve `inspected: boolean`.
   - A ficha `/api/public/site/[slug]/vehicles/[slug]` ganha `inspection: { provider, inspectedAt, result, reportUrl } | null`. Isso muda o `VehicleView` do `@carbud/site-kit`, então os templates também podem mostrar o selo.
6. **Integrações:** conferir se OLX/Webmotors têm campo de laudo; se tiverem, mandar junto no `portal-sync`.

### Portal (`portal-carbud`)

1. `types.ts`: `inspected?: boolean` em `PortalVehicle`, `inspection` em `VehicleDetail`.
2. `catalog.ts`: `vistoriado` em `FILTER_KEYS` e no `filterLabel`.
3. `filters-form.tsx`: chave "Vistoriado — Laudo e dados de vistoria disponíveis", igual à de FIPE.
4. Card: selo "Vistoriado". Ficha: bloco com empresa, data, resultado e link "Ver laudo (PDF)".

## 2. Visão 360°

**Regra de produto:** 360° de verdade é uma sequência de fotos girando em volta do carro (spin externo) ou uma panorâmica equirretangular do interior. Foto comum marcada como "360" não conta.

### Painel (`carbud`)

1. **Migration** em `vehicle_photos`: coluna `kind` (`photo | spin | pano`, padrão `photo`) e `spin_order` (inteiro, nulo). Fotos atuais continuam `photo`, sem backfill.
2. **Upload:**
   - **Spin:** 24 a 72 quadros tirados em volta do carro. Sobem pelo mesmo `resizeSingle` no navegador, só na variante `card` (sem `full`, para não multiplicar o R2 por 72).
   - **Panorâmica:** uma imagem equirretangular 2:1, até 8192 px de largura; o navegador reduz para 4096.
   - Contar no limite de fotos do plano (`src/lib/plans/catalog.ts`). Spin vale como 1, para não punir quem usa.
3. **Tela:** aba "360°" na galeria do veículo: arrastar a pasta de quadros (ordem pelo nome do arquivo) ou a panorâmica, com prévia do giro antes de salvar.
4. **Regra única:** `has360(v) = existe spin com >= 24 quadros ou existe pano`.
5. **API pública:**
   - `portal/vehicles` aceita `visao360=1` e devolve `has360: boolean`. A query fica barata com um contador desnormalizado `vehicles.spin_frames`, atualizado no upload, igual a `photosCount`.
   - A ficha devolve `spin: string[]` (URLs na ordem) e `pano: string | null`.
6. **Templates de site (`site-kit`):** visualizador opcional na galeria. Fica para depois do portal.

### Portal (`portal-carbud`)

1. Filtro "Visão 360° — Fotos imersivas quando disponíveis" e selo "360°" no card.
2. **Visualizador:**
   - **Spin:** componente client que troca o `src` conforme arrasta (pointer events) e pré-carrega os quadros só quando a pessoa abre o modo 360. A ficha não pode pagar 72 imagens no carregamento.
   - **Panorâmica:** `@photo-sphere-viewer/core` carregado sob demanda (`next/dynamic`). É a única dependência nova que vale a pena; escrever WebGL à mão não compensa.
3. Na galeria da ficha, o 360° entra como primeiro slide com um botão "Ver em 360°". Sem dado, nada aparece.

## Ordem sugerida

1. Vistoria no painel (migration, upload, tela, regra com teste).
2. Vistoria na API pública + portal (filtro, selo, ficha).
3. 360° no painel (migration, upload de spin e pano, contador).
4. 360° na API pública + portal (filtro, selo, visualizador).
5. Selos e visualizador nos templates de site.

Cada etapa sobe sozinha. Mudar o contrato de `portal/*` exige mudar os dois repositórios no mesmo dia (ver `CLAUDE.md` dos dois). Depois de cada migration, rodar `/api/ops/migrate` em produção.
