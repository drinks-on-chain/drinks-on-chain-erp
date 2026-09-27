// Utilidades de formulario compartidas por vinificación, crianza y destilación.
// Las cifras se escriben en es-BO ("22,4") o con punto ("22.4"); las fechas se tratan en UTC,
// igual que las muestra src/lib/format.ts.

// Las cifras se leen con `parseDecimal` de `@/lib/format` (el único del ecosistema).

/** "2026-09-25" (UTC) para un `<input type="date">`. */
export const toDateInput = (d: Date) => d.toISOString().slice(0, 10);

/** "2026-09-25T12:00" (UTC) para un `<input type="datetime-local">`. */
export const toDateTimeInput = (d: Date) => d.toISOString().slice(0, 16);

/** Valor de `datetime-local` (tomado en UTC) a ISO completo. */
export const dateTimeInputToIso = (v: string) => (v.length === 16 ? `${v}:00Z` : v);

/** true si el valor de un input de fecha (o fecha y hora) cae después de `now`. */
export function isAfter(value: string, now: Date): boolean {
  const iso = value.length === 10 ? `${value}T00:00:00Z` : dateTimeInputToIso(value);
  const ms = Date.parse(iso);
  return !Number.isNaN(ms) && ms > now.getTime();
}

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

export const hasErrors = (e: Record<string, string | undefined>) => Object.values(e).some(Boolean);
