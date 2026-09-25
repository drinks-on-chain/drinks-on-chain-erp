// Utilidades de formulario compartidas por vinificación, crianza y destilación.
// Las cifras se escriben en es-BO ("22,4") o con punto ("22.4"); las fechas se tratan en UTC,
// igual que las muestra src/lib/format.ts.

/**
 * Convierte lo que escribe la persona en un número. Acepta coma o punto decimal y puntos de
 * miles ("12.100,5"). Devuelve null si está vacío o no es un número.
 */
export function parseDecimal(input: string): number | null {
  let s = input.trim().replace(/\s/g, "");
  if (s === "") return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if ((s.match(/\./g) ?? []).length > 1) s = s.replace(/\./g, "");
  if (!/^-?\d+(\.\d+)?$/.test(s) && !/^-?\.\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

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

/** Mensajes de un error de validación del backend (`details` es una lista de textos). */
export function detailMessages(details: unknown): string[] {
  if (Array.isArray(details)) return details.map(String);
  if (typeof details === "string") return [details];
  return [];
}

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

export const hasErrors = (e: Record<string, string | undefined>) => Object.values(e).some(Boolean);
