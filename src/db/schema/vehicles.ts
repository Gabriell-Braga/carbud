import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createdAt, idColumn, updatedAt } from "./_shared";
import { tenants } from "./tenants";
import type { BodyType, Fuel, Transmission, VehicleStatus } from "@carbud/site-kit/catalog";

/*
 * Os valores de cambio, combustivel, carroceria e status moram no pacote
 * compartilhado, nao aqui.
 *
 * Quem precisa deles junto com o rotulo em portugues e o template — e o app dos
 * sites, que renderiza os mesmos templates, nao tem banco nenhum. Deixar a
 * lista no schema obrigaria aquele app a depender do Drizzle para saber que
 * "cvt" existe. O schema le do pacote e continua sendo a unica fonte para o
 * banco.
 */
export {
  VEHICLE_STATUS,
  TRANSMISSIONS,
  FUELS,
  BODY_TYPES,
  type VehicleStatus,
  type Transmission,
  type Fuel,
  type BodyType,
} from "@carbud/site-kit/catalog";

export const vehicles = sqliteTable(
  "vehicles",
  {
    id: idColumn(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    brand: text("brand").notNull(),
    model: text("model").notNull(),
    version: text("version"),
    yearManufacture: integer("year_manufacture").notNull(),
    yearModel: integer("year_model").notNull(),
    mileageKm: integer("mileage_km").notNull().default(0),
    priceCents: integer("price_cents").notNull().default(0),
    priceOnRequest: integer("price_on_request", { mode: "boolean" }).notNull().default(false),
    transmission: text("transmission").$type<Transmission>(),
    fuel: text("fuel").$type<Fuel>(),
    bodyType: text("body_type").$type<BodyType>(),
    color: text("color"),
    doors: integer("doors"),
    /**
     * Placa completa, normalizada: maiuscula, sem hifen.
     *
     * O site publico continua mostrando so o final — publicar a placa inteira
     * identifica o veiculo para qualquer um. Aqui ela existe para a loja.
     */
    licensePlate: text("license_plate"),
    /**
     * O final digitado antes de a placa inteira passar a ser guardada.
     *
     * Fica de leitura apenas, e nao e mais escrito. Um digito nao reconstroi
     * uma placa, entao apagar a coluna perderia a unica informacao que os
     * veiculos antigos tem — a ficha publica deles continuaria mostrando o
     * final gracas a ela.
     */
    licensePlateEnd: text("license_plate_end"),
    /** Lista de opcionais (chaves do catálogo em src/lib/catalog/options.ts). */
    options: text("options", { mode: "json" }).$type<string[]>(),
    description: text("description"),
    /** Unidade dona do carro; nulo em revenda de uma loja só. */
    storeId: text("store_id"),
    /**
     * Referência da FIPE congelada no momento da consulta.
     *
     * Guardada em vez de consultada na hora de exibir: a tabela muda todo mês,
     * e um anúncio "10% acima da FIPE" que vira "na faixa" sozinho, sem
     * ninguém mexer no preço, confunde quem precifica. O mês fica junto para
     * a tela dizer de quando é a referência.
     */
    fipeCode: text("fipe_code"),
    fipePriceCents: integer("fipe_price_cents"),
    fipeReference: text("fipe_reference"),
    /**
     * Vistoria: só vale com o laudo em PDF anexado (`inspectionReportKey`).
     * Selo sem documento é o que a loja marca em tudo e o comprador deixa de
     * acreditar. A regra de quem ganha o selo mora em `isInspected`.
     */
    inspectionProvider: text("inspection_provider"),
    /** Data do laudo, `AAAA-MM-DD`. */
    inspectionDate: text("inspection_date"),
    inspectionResult: text("inspection_result").$type<InspectionResult>(),
    inspectionReportKey: text("inspection_report_key"),
    status: text("status").$type<VehicleStatus>().notNull().default("draft"),
    /**
     * Rascunho provisório: existe só para as fotos terem onde morar enquanto a
     * ficha ainda não foi salva. Preenchido na criação e zerado no primeiro
     * salvamento — a faxina apaga o que passar da validade, e rascunho que a
     * pessoa guardou de propósito tem isto nulo e nunca é tocado.
     */
    draftExpiresAt: integer("draft_expires_at", { mode: "timestamp_ms" }),
    featured: integer("featured", { mode: "boolean" }).notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    views: integer("views").notNull().default(0),
    coverPhotoKey: text("cover_photo_key"),
    photosCount: integer("photos_count").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("vehicles_tenant_slug_unique").on(table.tenantId, table.slug),
    index("vehicles_tenant_status_idx").on(table.tenantId, table.status),
    index("vehicles_tenant_featured_idx").on(table.tenantId, table.featured, table.status),
    index("vehicles_tenant_brand_idx").on(table.tenantId, table.brand, table.model),
    index("vehicles_tenant_price_idx").on(table.tenantId, table.priceCents),
    index("vehicles_tenant_created_idx").on(table.tenantId, table.createdAt),
  ],
);

export const INSPECTION_RESULTS = ["approved", "approved_with_notes", "rejected"] as const;
export type InspectionResult = (typeof INSPECTION_RESULTS)[number];

export type Vehicle = typeof vehicles.$inferSelect;
export type NewVehicle = typeof vehicles.$inferInsert;

/** Chaves das 3 variantes geradas no browser durante o upload. */
export type PhotoVariants = {
  thumb: string;
  card: string;
  full: string;
};

export const vehiclePhotos = sqliteTable(
  "vehicle_photos",
  {
    id: idColumn(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    vehicleId: text("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "cascade" }),
    variants: text("variants", { mode: "json" }).$type<PhotoVariants>().notNull(),
    width: integer("width"),
    height: integer("height"),
    sizeBytes: integer("size_bytes"),
    position: integer("position").notNull().default(0),
    isCover: integer("is_cover", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
  },
  (table) => [
    index("vehicle_photos_vehicle_idx").on(table.vehicleId, table.position),
    index("vehicle_photos_tenant_idx").on(table.tenantId),
  ],
);

export type VehiclePhoto = typeof vehiclePhotos.$inferSelect;

/** Catálogo curado de marcas/modelos (global, com possibilidade de item criado por tenant). */
export const vehicleBrands = sqliteTable(
  "vehicle_brands",
  {
    id: idColumn(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    createdByTenantId: text("created_by_tenant_id"),
  },
  (table) => [uniqueIndex("vehicle_brands_slug_unique").on(table.slug)],
);

export const vehicleModels = sqliteTable(
  "vehicle_models",
  {
    id: idColumn(),
    brandId: text("brand_id")
      .notNull()
      .references(() => vehicleBrands.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    createdByTenantId: text("created_by_tenant_id"),
  },
  (table) => [uniqueIndex("vehicle_models_brand_slug_unique").on(table.brandId, table.slug)],
);

export type Media360Kind = "spin" | "pano";

/**
 * Visão 360° de um veículo, à parte de `vehicle_photos`.
 *
 * Um giro tem dezenas de quadros que não são fotos da galeria: misturados lá,
 * toda consulta de foto (capa, contagem, card, feed dos portais) teria que
 * aprender a ignorá-los. Aqui cada linha é um giro externo (`spin`, quadros na
 * ordem em volta do carro) ou uma panorâmica do interior (`pano`, uma chave só).
 */
export const vehicleMedia360 = sqliteTable(
  "vehicle_media_360",
  {
    id: idColumn(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    vehicleId: text("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "cascade" }),
    kind: text("kind").$type<Media360Kind>().notNull(),
    keys: text("keys", { mode: "json" }).$type<string[]>().notNull(),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("vehicle_media_360_vehicle_kind_unique").on(table.vehicleId, table.kind)],
);

export type VehicleMedia360 = typeof vehicleMedia360.$inferSelect;
