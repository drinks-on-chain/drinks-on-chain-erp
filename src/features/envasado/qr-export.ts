import { strToU8, zipSync, type Zippable } from "fflate";
import { getQRPath } from "@drinks-on-chain/ui";
import { bottleCodesCsv, fileSafe, type BottleCode } from "./qr-codes";

// Archivos de QR generados en el navegador (09 §8 punto 10): el mismo motor que pinta el
// componente QRCode del sistema de diseño, tinta sobre papel claro con zona de silencio.

const PAPER = "#fdfcf5";
const INK = "#000000";

/** SVG autónomo del código (sin dependencias de la página). */
export function qrSvg(
  value: string,
  { size = 512, margin = 4, label }: { size?: number; margin?: number; label?: string } = {},
) {
  const { path, modules } = getQRPath(value, "M");
  const box = modules + margin * 2;
  const title = label ? `<title>${escapeXml(label)}</title>` : "";
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${-margin} ${-margin} ${box} ${box}" shape-rendering="crispEdges">` +
    `${title}<rect x="${-margin}" y="${-margin}" width="${box}" height="${box}" fill="${PAPER}"/>` +
    `<path d="${path}" fill="${INK}"/></svg>\n`
  );
}

function escapeXml(s: string) {
  return s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);
}

/** Descarga un Blob con un nombre de archivo. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Se libera después de que el navegador haya empezado la descarga.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** PNG del código a `size` píxeles (rasteriza el SVG en un canvas). */
export async function qrPng(value: string, size = 1024): Promise<Blob> {
  const svg = qrSvg(value, { size });
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("No se pudo generar la imagen del código."));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("El navegador no permite generar imágenes.");
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, size, size);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("No se pudo generar el PNG."))), "image/png"),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function csvBlob(lotCode: string, codes: BottleCode[]) {
  // BOM para que Excel abra el UTF-8 sin romper los acentos.
  return new Blob(["﻿", bottleCodesCsv(lotCode, codes)], { type: "text/csv;charset=utf-8" });
}

const LEEME = (lotCode: string, count: number, lotUrl: string) =>
  [
    `Lote de códigos QR · ${lotCode}`,
    "",
    `Código del lote: ${lotUrl}`,
    `Códigos por botella: ${count} (carpeta botellas/, índice en codigos.csv).`,
    "",
    "Los códigos por botella son PROVISIONALES: el backend solo emite hoy un código por lote.",
    "Apuntan al pasaporte del lote con el número de botella (?n=0001) y se sustituirán",
    "cuando el backend emita códigos individuales.",
    "",
  ].join("\r\n");

/**
 * ZIP con el QR del lote, un SVG por botella y el CSV. Genera por tandas para no bloquear
 * la interfaz e informa del avance (0–1).
 */
export async function codesZip(
  lotCode: string,
  lotUrl: string,
  codes: BottleCode[],
  onProgress?: (ratio: number) => void,
): Promise<Blob> {
  const folder = fileSafe(lotCode);
  const files: Zippable = {
    [`${folder}/LEEME.txt`]: strToU8(LEEME(lotCode, codes.length, lotUrl)),
    [`${folder}/codigos.csv`]: strToU8("﻿" + bottleCodesCsv(lotCode, codes)),
    [`${folder}/lote-${folder}.svg`]: strToU8(qrSvg(lotUrl, { label: lotCode })),
  };
  const BATCH = 200;
  for (let i = 0; i < codes.length; i += BATCH) {
    for (const c of codes.slice(i, i + BATCH)) {
      files[`${folder}/botellas/${fileSafe(c.code)}.svg`] = strToU8(qrSvg(c.url, { size: 256, label: c.code }));
    }
    onProgress?.(Math.min(1, (i + BATCH) / Math.max(1, codes.length)) * 0.9);
    await new Promise((r) => setTimeout(r, 0));
  }
  const zipped = zipSync(files, { level: 6 });
  onProgress?.(1);
  return new Blob([zipped as BlobPart], { type: "application/zip" });
}
