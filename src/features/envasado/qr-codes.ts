// Códigos QR de un embotellado. El backend da un `qrBatchUrl` por lote (09 §8, puntos 2 y 10);
// el consumidor debe llegar al pasaporte del Marketplace (`app./b/{código}`), así que la URL
// se construye con NEXT_PUBLIC_URL_APP o, si no está, con el origen de `qrBatchUrl`.
// Los códigos por botella son provisionales hasta que el backend emita códigos individuales.

/** Origen del Marketplace: `urlApp` si está configurada; si no, el de `qrBatchUrl`. */
export function marketplaceOrigin(urlApp: string, qrBatchUrl: string | null | undefined): string | null {
  if (urlApp) return urlApp.replace(/\/+$/, "");
  if (!qrBatchUrl) return null;
  try {
    return new URL(qrBatchUrl).origin;
  } catch {
    return null;
  }
}

/** URL pública del pasaporte del lote: `{origen}/b/{código}`. */
export function passportUrl(origin: string, lotCode: string): string {
  return `${origin}/b/${encodeURIComponent(lotCode)}`;
}

export type BottleCode = { serial: string; code: string; url: string };

/** Número de dígitos del correlativo (mínimo 4: 0001). */
export const serialWidth = (count: number) => Math.max(4, String(Math.max(0, count)).length);

/** Un código por botella: `{lote}-0001` → `{origen}/b/{lote}?n=0001`. */
export function bottleCodes(lotCode: string, count: number, origin: string): BottleCode[] {
  const width = serialWidth(count);
  const base = passportUrl(origin, lotCode);
  return Array.from({ length: Math.max(0, Math.floor(count)) }, (_, i) => {
    const serial = String(i + 1).padStart(width, "0");
    return { serial, code: `${lotCode}-${serial}`, url: `${base}?n=${serial}` };
  });
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV (UTF-8, separador coma, fin de línea CRLF) con una fila por botella. */
export function bottleCodesCsv(lotCode: string, codes: BottleCode[]): string {
  const rows = [
    ["codigo", "lote", "botella", "url", "estado"],
    ...codes.map((c) => [c.code, lotCode, c.serial, c.url, "provisional"]),
  ];
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** Nombre de archivo seguro a partir del código de lote. */
export const fileSafe = (s: string) => s.replace(/[^\w.-]+/g, "_");
