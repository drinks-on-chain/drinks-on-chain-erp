// Formato de cifras y fechas para Bolivia, en español. Cifras con separador de miles y
// tabulares en pantalla (01-erp §11).

const LOCALE = "es-BO";

export const fmtNumber = (n: number, digits = 0) =>
  new Intl.NumberFormat(LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);

export const fmtKg = (n: number) => `${fmtNumber(n)} kg`;
export const fmtLiters = (n: number, digits = 0) => `${fmtNumber(n, digits)} L`;

/** "4 mar 2026". Las fechas del backend son ISO en UTC; se muestran en UTC para no mover el día. */
export const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(iso))
    .replace(".", "");

export const fmtDateTime = (iso: string) =>
  new Intl.DateTimeFormat(LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  })
    .format(new Date(iso))
    .replace(".", "");

/** "Faltan 18 días" / "Falta 1 día" / "Liberado". */
export const fmtDaysLeft = (days: number) =>
  days <= 0 ? "Liberado" : days === 1 ? "Falta 1 día" : `Faltan ${fmtNumber(days)} días`;

/** Dirección o hash abreviado: "GDQ4…7KXV". */
export const shortHash = (s: string, head = 4, tail = 4) =>
  s.length <= head + tail + 1 ? s : `${s.slice(0, head)}…${s.slice(-tail)}`;

/**
 * Lee una cifra escrita a mano: "4,2" y "4.2" son 4,2; "2.350" y "18.400" (miles es-BO) son
 * 2350 y 18400. Con `grouping: false` el punto siempre es decimal (coordenadas).
 * Devuelve null si está vacía o no es un número.
 */
export function parseDecimal(
  input: string | number | null | undefined,
  { grouping = true }: { grouping?: boolean } = {},
): number | null {
  if (input == null) return null;
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  let s = input.replace(/[\s ]/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (grouping && /^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  if (!/^-?\d*\.?\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Cifra para un campo editable, con coma decimal y sin separador de miles ("4,2"). */
export const numberToInput = (n: number | null | undefined) => (n == null ? "" : String(n).replace(".", ","));
