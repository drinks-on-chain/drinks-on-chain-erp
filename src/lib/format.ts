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
