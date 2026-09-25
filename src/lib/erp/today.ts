import { env } from "@/lib/env";

/**
 * "Hoy" para candados y plazos. Con mocks se usa la fecha de referencia de los fixtures
 * (2026-09-25) para que los candados sean reproducibles; con backend real, la fecha actual.
 */
export const MOCK_TODAY = "2026-09-25";

export function today(): Date {
  return env.mocks ? new Date(`${MOCK_TODAY}T12:00:00Z`) : new Date();
}

/** Días enteros desde hoy hasta `iso` (negativo si ya pasó). */
export function daysUntil(iso: string): number {
  const ms = new Date(iso).getTime() - today().getTime();
  return Math.ceil(ms / 86_400_000);
}

/** true si `iso` cae en el mismo día (UTC) que hoy. */
export function isToday(iso: string): boolean {
  return iso.slice(0, 10) === today().toISOString().slice(0, 10);
}
