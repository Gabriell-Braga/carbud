-- O plano "Rede" passa a se chamar "Scale", como na página de planos do site,
-- e o slug acompanha porque o botão de contratar do site chega com ?plano=scale.
-- Revendas apontam para o id, então nada muda para quem já está no plano.
UPDATE `plans` SET `name` = 'Scale', `slug` = 'scale', `updated_at` = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE `slug` = 'rede' AND NOT EXISTS (SELECT 1 FROM `plans` WHERE `slug` = 'scale');
