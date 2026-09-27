import { z } from "zod";

// Envoltorio común del backend (09 §1 y contrato de la Ola 0 §1).
export const errorEnvelope = z.object({
  success: z.literal(false),
  statusCode: z.number(),
  timestamp: z.string().optional(),
  path: z.string().optional(),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

export const successEnvelope = z.object({
  success: z.literal(true),
  statusCode: z.number().optional(),
  timestamp: z.string().optional(),
  path: z.string().optional(),
  data: z.unknown(),
});

export type Page<T> = { items: T[]; total: number; limit: number; offset: number };

export type PageParams = { limit?: number; offset?: number };

/**
 * Normaliza una lista del backend a `Page<T>`. El contrato de la Ola 0 §2 fija
 * `{ items, total, limit, offset }` (`limit` 20 por defecto, 100 como máximo); el array plano
 * del backend anterior a O0-BE-2 se sigue aceptando hasta H1.
 */
export function toPage<T>(data: unknown, item: z.ZodType<T>, params: PageParams = {}): Page<T> {
  if (Array.isArray(data)) {
    const items = z.array(item).parse(data);
    return { items, total: items.length, limit: params.limit ?? items.length, offset: params.offset ?? 0 };
  }
  return z
    .object({
      items: z.array(item),
      total: z.number(),
      limit: z.number().optional(),
      offset: z.number().optional(),
    })
    .transform((p) => ({
      items: p.items,
      total: p.total,
      limit: p.limit ?? params.limit ?? p.items.length,
      offset: p.offset ?? params.offset ?? 0,
    }))
    .parse(data);
}
