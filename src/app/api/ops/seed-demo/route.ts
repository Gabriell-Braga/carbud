import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import {
  billingStatus,
  financings,
  leadEvents,
  leads,
  plans,
  stores,
  subscriptions,
  tenantSites,
  tenants,
  users,
  vehicleAppraisals,
  vehiclePhotos,
  vehicles,
} from "@/db/schema";
import type { LeadEventType, LeadSource, LeadStatus } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { strongPasswordSchema } from "@/lib/auth/password-policy";
import { USER_AGENT } from "@/lib/brand";
import { cacheKeys, invalidate } from "@/lib/cache";
import { badRequest, conflict, jsonOk, withApi } from "@/lib/http";
import { assertOpsSecret } from "@/lib/ops";
import { invalidateEntitlements } from "@/lib/plans/service";
import { ensureStages } from "@/lib/services/crm";
import { putObject, vehiclePhotoKey } from "@/lib/storage/r2";
import { nextDueDate } from "@/lib/services/tenants";
import { slugify } from "@/lib/utils";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{3,40}$/).default("demo"),
  /** Só completa as fotos da demo que já existe; dispensa e-mail e senha. */
  photos: z.boolean().optional(),
  adminEmail: z.string().trim().toLowerCase().email().optional(),
  adminPassword: strongPasswordSchema.optional(),
});

/*
 * O proxy do Webflow corta a request em ~100s, e baixar 22 fotos passa disso.
 * As fotos vão em chamadas à parte, cada uma parando antes do corte; quem
 * chama repete enquanto `photosPending` > 0.
 */
const PHOTO_BUDGET_MS = 60_000;

const DAY = 24 * 60 * 60 * 1000;

/**
 * Revenda fictícia com estoque, leads, funil, avaliações e financiamentos,
 * para print de apresentação e demonstração comercial.
 *
 * Rodar de novo apaga a revenda do mesmo slug e recria do zero: é o jeito de
 * "resetar" a demo depois que alguém mexeu nela numa reunião. As fotos vêm do
 * Wikimedia Commons, numa segunda etapa: `{"photos": true}`, repetida até
 * `photosPending` chegar a zero.
 */
export const POST = withApi(async (request: Request) => {
  assertOpsSecret(request);

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw badRequest("Dados inválidos", parsed.error.issues);
  const { slug, adminEmail, adminPassword } = parsed.data;

  const db = await getDb();

  if (parsed.data.photos) {
    const [demo] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug));
    if (!demo) throw badRequest("Crie a demo antes de completar as fotos");
    return jsonOk(await attachPhotos(demo.id));
  }
  if (!adminEmail || !adminPassword) throw badRequest("Informe adminEmail e adminPassword");

  const [owner] = await db
    .select({ tenantId: users.tenantId })
    .from(users)
    .where(eq(users.email, adminEmail))
    .limit(1);
  const [previous] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug));
  if (owner && owner.tenantId !== (previous?.id ?? null)) {
    throw conflict("Este e-mail já é usado fora da revenda demo");
  }
  // tudo da revenda cai junto por cascade
  if (previous) await db.delete(tenants).where(eq(tenants.id, previous.id));

  const [plan] = await db
    .select({ id: plans.id, priceCents: plans.priceCents })
    .from(plans)
    .orderBy(desc(plans.priceCents))
    .limit(1);

  const [tenant] = await db
    .insert(tenants)
    .values({
      name: "Prime Motors",
      slug,
      legalName: "Prime Motors Comércio de Veículos Ltda",
      cnpj: "12345678000195",
      templateId: "showroom",
      planId: plan?.id ?? null,
      status: "active",
      notes: "Revenda de demonstração (gerada por /api/ops/seed-demo).",
    })
    .returning();
  const tenantId = tenant.id;

  await db.insert(tenantSites).values({
    tenantId,
    phone: "2733221100",
    whatsapp: "5527999887766",
    whatsappForm: true,
    whatsappFormFields: ["name", "message", "tradeIn"],
    email: "contato@primemotors.com.br",
    addressStreet: "Av. Nossa Senhora da Penha",
    addressNumber: "1500",
    addressDistrict: "Praia do Canto",
    addressCity: "Vitória",
    addressState: "ES",
    addressZip: "29055131",
    businessHours: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      weekday,
      open: weekday === 0 ? null : "08:00",
      close: weekday === 0 ? null : weekday === 6 ? "13:00" : "18:00",
    })),
    social: { instagram: "https://instagram.com/primemotors", facebook: "https://facebook.com/primemotors" },
    aboutTitle: "Há 15 anos realizando o sonho do carro novo",
    aboutText:
      "A Prime Motors nasceu em Vitória com uma ideia simples: vender carro com transparência. Todos os veículos passam por vistoria cautelar, têm procedência garantida e saem com garantia de motor e câmbio.",
    stats: [
      { value: "15 anos", label: "de mercado" },
      { value: "+4.000", label: "carros vendidos" },
      { value: "4,9", label: "nota no Google" },
    ],
    reviews: [
      { rating: 5, text: "Atendimento excelente do começo ao fim. Saí com o carro no mesmo dia.", author: "Mariana S." },
      { rating: 5, text: "Melhor avaliação do meu usado que encontrei em Vitória.", author: "Ricardo P." },
      { rating: 5, text: "Carro impecável e documentação toda resolvida por eles.", author: "Fernanda L." },
    ],
  });

  await db.insert(billingStatus).values({
    tenantId,
    status: "adimplente",
    dueDay: 10,
    amountCents: plan?.priceCents ?? 0,
    currentDueDate: nextDueDate(10),
    lastPaymentAt: new Date(Date.now() - 9 * DAY),
  });
  if (plan) {
    await db
      .insert(subscriptions)
      .values({ tenantId, planId: plan.id, status: "manual", priceCents: plan.priceCents });
  }

  const [matriz, filial] = await db
    .insert(stores)
    .values([
      {
        tenantId,
        name: "Matriz Praia do Canto",
        slug: "matriz",
        whatsapp: "5527999887766",
        addressCity: "Vitória",
        addressState: "ES",
        isDefault: true,
        sortOrder: 0,
      },
      {
        tenantId,
        name: "Filial Vila Velha",
        slug: "vila-velha",
        whatsapp: "5527999112233",
        addressCity: "Vila Velha",
        addressState: "ES",
        sortOrder: 1,
      },
    ])
    .returning({ id: stores.id });

  const team = await createTeam(tenantId, adminEmail, adminPassword, [matriz.id, filial.id]);
  const sellers = team.slice(1);

  const stock = await createStock(tenantId, [matriz.id, filial.id]);

  const stages = await ensureStages(tenantId);
  const leadCount = await createLeads(tenantId, stock, stages, sellers, [matriz.id, filial.id]);
  await createDesk(tenantId, stock, team[0], matriz.id);

  await invalidateEntitlements(tenantId);
  await invalidate(
    cacheKeys.tenantCoreById(tenantId),
    cacheKeys.tenantCoreBySlug(slug),
    cacheKeys.tenantSite(slug),
  );

  return jsonOk({
    tenantId,
    slug,
    vehicles: stock.length,
    leads: leadCount,
    photosPending: stock.length,
  });
});

/* ------------------------------------------------------------------------ */

type Member = { id: string; name: string };

async function createTeam(
  tenantId: string,
  adminEmail: string,
  adminPassword: string,
  storeIds: string[],
): Promise<Member[]> {
  const db = await getDb();
  const admin = await hashPassword(adminPassword);
  // os vendedores existem para o funil ter dono; ninguém entra com eles
  const locked = await hashPassword(crypto.randomUUID());
  const domain = adminEmail.split("@")[1];

  const people = [
    { name: "Carlos Mendes", role: "revenda_admin" as const, email: adminEmail, password: admin, storeId: null },
    ...[
      ["Juliana Rocha", storeIds[0]],
      ["Rafael Souza", storeIds[0]],
      ["Amanda Lima", storeIds[1]],
    ].map(([name, storeId]) => ({
      name,
      role: "vendedor" as const,
      email: `demo.${slugify(name)}@${domain}`,
      password: locked,
      storeId,
    })),
  ];

  return db
    .insert(users)
    .values(
      people.map((person) => ({
        tenantId,
        name: person.name,
        email: person.email,
        passwordHash: person.password.hash,
        passwordSalt: person.password.salt,
        role: person.role,
        status: "active" as const,
        storeId: person.storeId,
        mustChangePassword: false,
      })),
    )
    .returning({ id: users.id, name: users.name });
}

/* ------------------------------------------------------------------------ */

type Car = {
  brand: string;
  model: string;
  version: string;
  year: number;
  km: number;
  price: number;
  transmission: "manual" | "automatico" | "cvt";
  fuel: "flex" | "diesel" | "hibrido" | "gasolina";
  body: "hatch" | "sedan" | "suv" | "picape";
  color: string;
  photo: string;
};

const W = "https://upload.wikimedia.org/wikipedia/commons/thumb";

// Fotos conferidas em 19/10/2026; thumbnail de 1280px, que o Wikimedia sempre gera.
const CARS: Car[] = [
  { brand: "Toyota", model: "Corolla", version: "2.0 Altis Hybrid", year: 2023, km: 21000, price: 158900, transmission: "cvt", fuel: "hibrido", body: "sedan", color: "Branco", photo: `${W}/f/fe/Toyota_Corolla_Hybrid_%28E210%29_IMG_4338.jpg/1280px-Toyota_Corolla_Hybrid_%28E210%29_IMG_4338.jpg` },
  { brand: "Honda", model: "Civic", version: "2.0 e:HEV Touring", year: 2024, km: 9800, price: 239900, transmission: "cvt", fuel: "hibrido", body: "sedan", color: "Cinza", photo: `${W}/1/1a/Honda_Civic_e-HEV_Sport_%28XI%29_%E2%80%93_f_30062024.jpg/1280px-Honda_Civic_e-HEV_Sport_%28XI%29_%E2%80%93_f_30062024.jpg` },
  { brand: "Jeep", model: "Compass", version: "1.3 T270 Limited", year: 2022, km: 38500, price: 162900, transmission: "automatico", fuel: "flex", body: "suv", color: "Preto", photo: `${W}/e/e0/2019_Jeep_Compass_Limited_2.4L%2C_front_7.6.19.jpg/1280px-2019_Jeep_Compass_Limited_2.4L%2C_front_7.6.19.jpg` },
  { brand: "Jeep", model: "Renegade", version: "1.3 T270 Longitude", year: 2023, km: 24000, price: 124900, transmission: "automatico", fuel: "flex", body: "suv", color: "Vermelho", photo: `${W}/2/2e/Jeep_Renegade_1.6_MultiJet_2WD_Longitude_%E2%80%93_Frontansicht%2C_9._November_2014%2C_D%C3%BCsseldorf.jpg/1280px-Jeep_Renegade_1.6_MultiJet_2WD_Longitude_%E2%80%93_Frontansicht%2C_9._November_2014%2C_D%C3%BCsseldorf.jpg` },
  { brand: "Volkswagen", model: "T-Cross", version: "1.4 250 TSI Highline", year: 2023, km: 19500, price: 139900, transmission: "automatico", fuel: "flex", body: "suv", color: "Azul", photo: `${W}/2/23/VW_T-Cross_Style_%28Facelift%29_%E2%80%93_f_22022025.jpg/1280px-VW_T-Cross_Style_%28Facelift%29_%E2%80%93_f_22022025.jpg` },
  { brand: "Volkswagen", model: "Polo", version: "1.0 200 TSI Highline", year: 2022, km: 33000, price: 92900, transmission: "automatico", fuel: "flex", body: "hatch", color: "Branco", photo: `${W}/7/79/VW_Polo_beats_%28VI%29_%E2%80%93_f_03032019.jpg/1280px-VW_Polo_beats_%28VI%29_%E2%80%93_f_03032019.jpg` },
  { brand: "Chevrolet", model: "Onix", version: "1.0 Turbo RS", year: 2023, km: 17800, price: 94900, transmission: "automatico", fuel: "flex", body: "hatch", color: "Prata", photo: `${W}/2/20/2022_Chevrolet_Onix_RS_1.0_Turbo.jpg/1280px-2022_Chevrolet_Onix_RS_1.0_Turbo.jpg` },
  { brand: "Hyundai", model: "HB20", version: "1.0 TGDI Platinum Plus", year: 2024, km: 8200, price: 104900, transmission: "automatico", fuel: "flex", body: "hatch", color: "Branco", photo: `${W}/3/35/Hyundai_HB20_Comfort_Plus_2025.jpg/1280px-Hyundai_HB20_Comfort_Plus_2025.jpg` },
  { brand: "Hyundai", model: "Creta", version: "1.0 TGDI Limited", year: 2024, km: 12500, price: 142900, transmission: "automatico", fuel: "flex", body: "suv", color: "Branco", photo: `${W}/2/21/2024_Hyundai_Creta_1.5_MPi_SX%28O%29_%28India%29_front_view.png/1280px-2024_Hyundai_Creta_1.5_MPi_SX%28O%29_%28India%29_front_view.png` },
  { brand: "Fiat", model: "Toro", version: "2.0 Diesel Volcano 4x4", year: 2022, km: 52000, price: 159900, transmission: "automatico", fuel: "diesel", body: "picape", color: "Cinza", photo: `${W}/a/a6/Fiat_Toro_2018_in_Punta_del_Este_%28front%29_01.jpg/1280px-Fiat_Toro_2018_in_Punta_del_Este_%28front%29_01.jpg` },
  { brand: "Fiat", model: "Pulse", version: "1.0 Turbo Impetus", year: 2023, km: 22000, price: 109900, transmission: "cvt", fuel: "flex", body: "suv", color: "Vermelho", photo: `${W}/7/74/2023_Fiat_Pulse_Impetus_%28Colombia%29_front_view_01.jpg/1280px-2023_Fiat_Pulse_Impetus_%28Colombia%29_front_view_01.jpg` },
  { brand: "Fiat", model: "Strada", version: "1.3 Volcano CD", year: 2023, km: 28000, price: 112900, transmission: "cvt", fuel: "flex", body: "picape", color: "Branco", photo: `${W}/8/87/Fiat_Strada_2020_Volcano_in_Montevideo_%28front%29.jpg/1280px-Fiat_Strada_2020_Volcano_in_Montevideo_%28front%29.jpg` },
  { brand: "Toyota", model: "Hilux", version: "2.8 SRX 4x4 Diesel", year: 2021, km: 78000, price: 249900, transmission: "automatico", fuel: "diesel", body: "picape", color: "Prata", photo: `${W}/1/1b/2016_Toyota_HiLux_Invincible_D-4D_4WD_2.4_Front.jpg/1280px-2016_Toyota_HiLux_Invincible_D-4D_4WD_2.4_Front.jpg` },
  { brand: "Honda", model: "HR-V", version: "1.5 Turbo Touring", year: 2023, km: 26000, price: 169900, transmission: "cvt", fuel: "flex", body: "suv", color: "Cinza", photo: `${W}/7/71/2023_Honda_HR-V_Advance_i-MMD_CVT_1.5.jpg/1280px-2023_Honda_HR-V_Advance_i-MMD_CVT_1.5.jpg` },
  { brand: "Nissan", model: "Kicks", version: "1.6 Exclusive", year: 2022, km: 41000, price: 109900, transmission: "cvt", fuel: "flex", body: "suv", color: "Azul", photo: `${W}/6/65/2025_Nissan_Kicks_SV_AWD_in_Deep_Blue_Pearl%2C_front_right%2C_2024-10-06.jpg/1280px-2025_Nissan_Kicks_SV_AWD_in_Deep_Blue_Pearl%2C_front_right%2C_2024-10-06.jpg` },
  { brand: "Renault", model: "Kwid", version: "1.0 Outsider", year: 2023, km: 15000, price: 64900, transmission: "manual", fuel: "flex", body: "hatch", color: "Laranja", photo: `${W}/7/77/2023_Renault_Kwid_Iconic_%28Colombia%29_front_view_01.png/1280px-2023_Renault_Kwid_Iconic_%28Colombia%29_front_view_01.png` },
  { brand: "BMW", model: "X1", version: "2.0 sDrive20i M Sport", year: 2023, km: 18000, price: 289900, transmission: "automatico", fuel: "gasolina", body: "suv", color: "Branco", photo: `${W}/b/bc/BMW_U11_1X7A6826.jpg/1280px-BMW_U11_1X7A6826.jpg` },
  { brand: "Toyota", model: "SW4", version: "2.8 Diamond 7L 4x4", year: 2022, km: 46000, price: 339900, transmission: "automatico", fuel: "diesel", body: "suv", color: "Preto", photo: `${W}/6/66/2015_Toyota_Fortuner_%28New_Zealand%29.jpg/1280px-2015_Toyota_Fortuner_%28New_Zealand%29.jpg` },
  { brand: "Volkswagen", model: "Amarok", version: "3.0 V6 Extreme", year: 2022, km: 55000, price: 279900, transmission: "automatico", fuel: "diesel", body: "picape", color: "Cinza", photo: `${W}/3/38/VW_Amarok_3.0_TDI_4Motion_Style_%28II%29_%E2%80%93_f_05072025.jpg/1280px-VW_Amarok_3.0_TDI_4Motion_Style_%28II%29_%E2%80%93_f_05072025.jpg` },
  { brand: "Ford", model: "Ranger", version: "3.0 V6 Limited 4x4", year: 2024, km: 11000, price: 319900, transmission: "automatico", fuel: "diesel", body: "picape", color: "Azul", photo: `${W}/2/28/Ford_Ranger_%28T6%2C_P703%29_Wildtrak_IMG_7320.jpg/1280px-Ford_Ranger_%28T6%2C_P703%29_Wildtrak_IMG_7320.jpg` },
  { brand: "Fiat", model: "Fastback", version: "1.3 Turbo Limited Edition", year: 2023, km: 20000, price: 134900, transmission: "cvt", fuel: "flex", body: "suv", color: "Cinza", photo: `${W}/2/2e/2023_Fiat_Fastback_%28Colombia%29_front_view.png/1280px-2023_Fiat_Fastback_%28Colombia%29_front_view.png` },
  { brand: "Peugeot", model: "208", version: "1.0 Turbo GT", year: 2024, km: 7600, price: 114900, transmission: "cvt", fuel: "flex", body: "hatch", color: "Amarelo", photo: `${W}/c/c6/Peugeot_208_PureTech_130_EAT8_Allure_GT-Line_%28II%29_%E2%80%93_f_17102021.jpg/1280px-Peugeot_208_PureTech_130_EAT8_Allure_GT-Line_%28II%29_%E2%80%93_f_17102021.jpg` },
];

const OPTIONS = [
  ["ar-condicionado", "direcao-eletrica", "vidros-eletricos", "travas-eletricas", "multimidia", "carplay", "abs", "airbag"],
  ["ar-digital", "banco-couro", "piloto-automatico", "start-stop", "multimidia", "carplay", "abs", "airbag", "isofix"],
  ["ar-digital", "banco-couro", "teto-solar", "piloto-automatico", "gps", "carplay", "abs", "airbag", "alarme"],
];

type StockItem = { id: string; label: string; priceCents: number; status: string };

async function createStock(tenantId: string, storeIds: string[]): Promise<StockItem[]> {
  const db = await getDb();
  const now = Date.now();
  const items: StockItem[] = [];

  for (const [index, car] of CARS.entries()) {
    // quatro vendidos e dois reservados: o relatório e o estoque têm o que mostrar
    const status = index % 6 === 5 ? "sold" : index % 11 === 3 ? "reserved" : "available";
    const priceCents = car.price * 100;
    const [row] = await db
      .insert(vehicles)
      .values({
        tenantId,
        slug: `${slugify(`${car.brand} ${car.model} ${car.version} ${car.year}`)}-${index}`,
        brand: car.brand,
        model: car.model,
        version: car.version,
        yearManufacture: car.year - (index % 2),
        yearModel: car.year,
        mileageKm: car.km,
        priceCents,
        transmission: car.transmission,
        fuel: car.fuel,
        bodyType: car.body,
        color: car.color,
        doors: car.body === "picape" && index % 2 ? 2 : 4,
        licensePlate: `PP${String.fromCharCode(65 + (index % 26))}${index % 10}${String.fromCharCode(66 + (index % 20))}${10 + index}`,
        options: OPTIONS[index % OPTIONS.length],
        description: `${car.brand} ${car.model} ${car.version} ${car.year} em estado de zero, revisões em dia na concessionária, manual e chave reserva. Aceitamos seu usado na troca e financiamos em até 60x.`,
        storeId: storeIds[index % 3 === 2 ? 1 : 0],
        // FIPE de referência um pouco acima ou abaixo, para o comparativo ter cor
        fipePriceCents: Math.round(priceCents * (index % 3 === 0 ? 1.04 : index % 3 === 1 ? 0.97 : 1.0)),
        fipeReference: "outubro de 2026",
        status: status as "available",
        featured: index < 6,
        views: 80 + ((index * 137) % 900),
        createdAt: new Date(now - (3 + ((index * 7) % 85)) * DAY),
      })
      .returning({ id: vehicles.id });
    items.push({ id: row.id, label: `${car.brand} ${car.model} ${car.version} ${car.year}`, priceCents, status });
  }
  return items;
}

/** Baixa as fotos que faltam até o orçamento de tempo acabar. */
async function attachPhotos(tenantId: string): Promise<{ photos: number; photosPending: number }> {
  const db = await getDb();
  const deadline = Date.now() + PHOTO_BUDGET_MS;
  const missing = await db
    .select({ id: vehicles.id, slug: vehicles.slug })
    .from(vehicles)
    .where(and(eq(vehicles.tenantId, tenantId), eq(vehicles.photosCount, 0)));
  let saved = 0;

  for (const item of missing) {
    if (Date.now() > deadline) break;
    // o slug termina no índice do carro em CARS
    const car = CARS[Number(item.slug.split("-").pop())];
    if (!car) continue;
    try {
      const response = await fetchPhoto(car.photo);
      if (!response) continue;
      const type = response.headers.get("content-type") ?? "image/jpeg";
      const body = await response.arrayBuffer();
      const photoId = crypto.randomUUID();
      // uma variante só, apontada pelas três: a demo não precisa de três tamanhos
      const key = vehiclePhotoKey(tenantId, item.id, photoId, "full", type.includes("png") ? "png" : "jpg");
      await putObject(key, body, type);
      await db.insert(vehiclePhotos).values({
        id: photoId,
        tenantId,
        vehicleId: item.id,
        variants: { thumb: key, card: key, full: key },
        sizeBytes: body.byteLength,
        position: 0,
        isCover: true,
      });
      await db
        .update(vehicles)
        .set({ coverPhotoKey: key, photosCount: 1 })
        .where(eq(vehicles.id, item.id));
      saved += 1;
    } catch {
      // fica para a próxima chamada
    }
  }
  return { photos: saved, photosPending: missing.length - saved };
}

/** O Wikimedia responde 429 a rajadas: espera e tenta de novo antes de desistir. */
async function fetchPhoto(url: string): Promise<Response | null> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    // a política do Wikimedia barra user-agent sem contato
    const response = await fetch(url, {
      headers: { "user-agent": `${USER_AGENT}/1.0 (${process.env.APP_ORIGIN ?? "demo"})` },
    });
    if (response.ok) return response;
    if (response.status !== 429) return null;
    await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
  }
  return null;
}

/* ------------------------------------------------------------------------ */

const NAMES = [
  "Lucas Almeida", "Beatriz Costa", "Pedro Henrique Silva", "Camila Ferreira", "Gustavo Ribeiro",
  "Larissa Martins", "Thiago Carvalho", "Patrícia Gomes", "Bruno Oliveira", "Aline Barbosa",
  "Diego Nascimento", "Vanessa Teixeira", "Rodrigo Araújo", "Isabela Moreira", "Felipe Cardoso",
  "Natália Pereira", "Marcelo Santos", "Juliana Freitas", "André Lopes", "Carolina Dias",
  "Eduardo Monteiro", "Gabriela Pinto", "Leonardo Castro", "Renata Vieira", "Vinícius Rocha",
  "Tatiane Correia", "Matheus Azevedo", "Priscila Cunha", "Fábio Mendes", "Daniela Ramos",
  "Henrique Batista", "Letícia Farias", "Ricardo Nunes", "Sabrina Melo", "Otávio Brandão",
  "Mirela Campos", "Caio Fernandes", "Simone Duarte",
];

const MESSAGES = [
  "Olá, tenho interesse neste carro. Ainda está disponível?",
  "Qual a menor taxa de financiamento? Tenho 30% de entrada.",
  "Aceita meu usado na troca? Tenho um Gol 2018.",
  "Consigo agendar um test drive no sábado?",
  "Pode me mandar mais fotos do interior?",
  "Qual o valor à vista?",
];

const SOURCES: LeadSource[] = ["form", "whatsapp", "portal", "whatsapp", "phone", "form", "portal", "manual"];

type Stage = { id: string; name: string; kind: "open" | "won" | "lost" };

async function createLeads(
  tenantId: string,
  stock: StockItem[],
  stages: Stage[],
  sellers: Member[],
  storeIds: string[],
): Promise<number> {
  const db = await getDb();
  const now = Date.now();
  const open = stages.filter((stage) => stage.kind === "open");
  const won = stages.find((stage) => stage.kind === "won");
  const lost = stages.find((stage) => stage.kind === "lost");

  for (const [index, name] of NAMES.entries()) {
    // mais leads nas primeiras etapas, como num funil de verdade
    const stage =
      index % 9 === 4 && won ? won : index % 13 === 7 && lost ? lost : open[[0, 0, 0, 1, 1, 1, 2, 2, 3][index % 9] % open.length];
    const status: LeadStatus =
      stage.kind === "won" ? "won" : stage.kind === "lost" ? "lost" : stage === open[0] ? "new" : "in_progress";
    const car = stock[(index * 5) % stock.length];
    const source = SOURCES[index % SOURCES.length];
    const seller = sellers[index % sellers.length];
    const created = now - ((index * 29) % 45) * DAY - ((index * 37) % 600) * 60_000;
    const phone = `279${String(81000000 + index * 104729).slice(0, 8)}`;

    const [lead] = await db
      .insert(leads)
      .values({
        tenantId,
        vehicleId: car.id,
        vehicleLabel: car.label,
        name,
        phone,
        email: index % 3 === 0 ? `${slugify(name).replace(/-/g, ".")}@gmail.com` : null,
        message: MESSAGES[index % MESSAGES.length],
        source,
        status,
        stageId: stage.id,
        storeId: storeIds[index % 3 === 2 ? 1 : 0],
        assignedToUserId: status === "new" && index % 2 ? null : seller.id,
        utm: source === "form" ? { source: index % 2 ? "google" : "instagram", medium: "cpc", campaign: "seminovos-outubro" } : null,
        createdAt: new Date(created),
        updatedAt: new Date(created + DAY),
      })
      .returning({ id: leads.id });

    const events: { type: LeadEventType; body: string; direction?: "in" | "out"; at: number }[] = [
      { type: "created", body: "Lead recebido", at: created },
      { type: "whatsapp", body: MESSAGES[index % MESSAGES.length], direction: "in", at: created + 60_000 },
    ];
    if (status !== "new") {
      events.push(
        {
          type: "whatsapp",
          body: `Oi ${name.split(" ")[0]}, tudo bem? Aqui é ${seller.name.split(" ")[0]} da Prime Motors. O carro está disponível sim! Posso te mandar a ficha completa?`,
          direction: "out",
          at: created + 15 * 60_000,
        },
        { type: "stage_change", body: `Movido para ${stage.name}`, at: created + 3 * 60 * 60_000 },
      );
    }
    if (stage.kind === "open" && stage !== open[0]) {
      events.push({
        type: "note",
        body: "Cliente quer avaliar o usado dele na troca. Pediu simulação em 48x.",
        at: created + 5 * 60 * 60_000,
      });
    }

    await db.insert(leadEvents).values(
      events.map((event) => {
        // o sistema e o cliente não têm autor; o resto é do vendedor
        const byUs = event.type !== "created" && event.direction !== "in";
        return {
          tenantId,
          leadId: lead.id,
          type: event.type,
          body: event.body,
          direction: event.direction ?? null,
          userId: byUs ? seller.id : null,
          userName: byUs ? seller.name : null,
          createdAt: new Date(Math.min(event.at, now)),
        };
      }),
    );
  }
  return NAMES.length;
}

/** Avaliações de usado e propostas de financiamento, as telas da mesa de negócio. */
async function createDesk(tenantId: string, stock: StockItem[], admin: Member, storeId: string) {
  const db = await getDb();
  const now = Date.now();

  const appraisals = [
    { customer: "Lucas Almeida", brand: "Volkswagen", model: "Gol", version: "1.0 MPI", year: 2018, km: 72000, fipe: 4890000, offer: 4100000, status: "enviada" as const },
    { customer: "Camila Ferreira", brand: "Chevrolet", model: "Prisma", version: "1.4 LTZ", year: 2017, km: 88000, fipe: 5650000, offer: 4800000, status: "aceita" as const },
    { customer: "Thiago Carvalho", brand: "Hyundai", model: "HB20", version: "1.6 Comfort", year: 2019, km: 61000, fipe: 6390000, offer: 5500000, status: "rascunho" as const },
    { customer: "Renata Vieira", brand: "Fiat", model: "Argo", version: "1.3 Drive", year: 2020, km: 45000, fipe: 6920000, offer: 5900000, status: "recusada" as const },
  ];
  for (const [index, item] of appraisals.entries()) {
    await db.insert(vehicleAppraisals).values({
      tenantId,
      customerName: item.customer,
      customerPhone: `2799${String(7123400 + index * 311).slice(0, 7)}`,
      storeId,
      brand: item.brand,
      model: item.model,
      version: item.version,
      yearManufacture: item.year,
      yearModel: item.year,
      mileageKm: item.km,
      fipePriceCents: item.fipe,
      fipeReference: "outubro de 2026",
      conditionCents: -150000,
      repairsCents: -80000,
      suggestedCents: item.offer,
      offerCents: item.offer,
      targetSaleCents: Math.round(item.fipe * 0.98),
      status: item.status,
      validUntil: new Date(now + 5 * DAY),
      createdByUserId: admin.id,
      createdAt: new Date(now - (index * 4 + 1) * DAY),
    });
  }

  const banks = ["Banco do Brasil", "Santander", "Itaú", "BV"];
  const statuses = ["em_analise", "aprovado", "contratado", "rascunho"] as const;
  for (const [index, status] of statuses.entries()) {
    const car = stock[index * 3];
    const down = Math.round(car.priceCents * 0.3);
    const financed = car.priceCents - down;
    await db.insert(financings).values({
      tenantId,
      vehicleId: car.id,
      vehicleLabel: car.label,
      customerName: NAMES[index * 4 + 1],
      customerPhone: `2799${String(6543200 + index * 271).slice(0, 7)}`,
      bank: banks[index],
      vehiclePriceCents: car.priceCents,
      downPaymentCents: down,
      financedCents: financed,
      installments: 48,
      installmentCents: Math.round((financed * 1.55) / 48),
      status,
      storeId,
      createdByUserId: admin.id,
      createdAt: new Date(now - (index * 3 + 2) * DAY),
    });
  }
}
