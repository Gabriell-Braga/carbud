import { z } from "zod";
import { onlyDigits } from "@/lib/utils";

export const buyerChallengeSchema = z.object({
  email: z.string().trim().toLowerCase().email("Informe um e-mail válido").max(200),
});

export const buyerVerifySchema = buyerChallengeSchema.extend({
  code: z.string().trim().regex(/^\d{6}$/, "O código tem seis dígitos"),
});

export const buyerGoogleSchema = z.object({
  idToken: z.string().min(20).max(4000),
});

export const buyerProfileSchema = z.object({
  name: z.string().trim().min(2, "Informe seu nome").max(120).optional(),
  phone: z
    .string()
    .trim()
    .max(20)
    .refine((value) => value === "" || onlyDigits(value).length >= 10, "Informe um telefone válido com DDD")
    .optional(),
  marketingOptIn: z.boolean().optional(),
});

/** Retrato do card salvo pelo portal; só caminhos internos, para o link não virar redirecionamento aberto. */
export const favoriteSnapshotSchema = z.object({
  id: z.string().min(1).max(64),
  href: z.string().startsWith("/").refine((value) => !value.startsWith("//"), "Link inválido").max(300),
  title: z.string().max(200),
  subtitle: z.string().max(200),
  price: z.string().max(40),
  cover: z.string().max(500).nullable(),
  /** Fotos do carrossel do card; favorito salvo antes disso só tem a capa. */
  photos: z.array(z.string().max(500)).max(80).optional(),
});
