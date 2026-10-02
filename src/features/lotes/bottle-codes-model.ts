import type { BottleCodeExport, BottleUnit, BottleUnitStatus } from "@drinks-on-chain/mocks";
import type { Tone } from "@drinks-on-chain/ui";
import type { BottleCodeQuery, SerialRange } from "@/lib/erp/resources";
import { parseDecimal } from "@/lib/format";

// Códigos de botella (contrato de la Ola 2 §7): el servidor genera uno por botella al embotellar
// (8 caracteres con control), los lista paginados y los exporta en CSV o en un ZIP con los QR para
// la imprenta. Un código se anula con motivo y, si la etiqueta se dañó, se sustituye por otro de la
// misma serie. Aquí solo va la forma del rango y de los filtros.

export const BOTTLE_STATUS: Record<BottleUnitStatus, { label: string; tone: Tone }> = {
  ACTIVE: { label: "Activo", tone: "success" },
  VOIDED: { label: "Anulado", tone: "danger" },
};

export const EXPORT_STATUS: Record<BottleCodeExport["status"], { label: string; tone: Tone }> = {
  PENDING: { label: "Generando…", tone: "info" },
  READY: { label: "Listo para descargar", tone: "success" },
  FAILED: { label: "No se pudo generar", tone: "danger" },
};

export type RangeValues = { from: string; to: string };
export type RangeResult =
  { ok: true; range: SerialRange } | { ok: false; errors: Partial<Record<keyof RangeValues, string>> };

/**
 * Rango de series escrito a mano → parámetros `fromSerial` / `toSerial`. Vacío = todas. Que el
 * rango exista en el lote lo comprueba el servidor (422).
 */
export function parseSerialRange(v: RangeValues): RangeResult {
  const errors: Partial<Record<keyof RangeValues, string>> = {};
  const read = (text: string, key: keyof RangeValues): number | undefined => {
    if (!text.trim()) return undefined;
    const n = parseDecimal(text);
    if (n === null || !Number.isInteger(n) || n < 1) {
      errors[key] = "Escribe un número de serie (entero desde 1).";
      return undefined;
    }
    return n;
  };
  const fromSerial = read(v.from, "from");
  const toSerial = read(v.to, "to");
  if (fromSerial !== undefined && toSerial !== undefined && fromSerial > toSerial) {
    errors.to = "La serie final no puede ser menor que la inicial.";
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    range: {
      ...(fromSerial !== undefined ? { fromSerial } : {}),
      ...(toSerial !== undefined ? { toSerial } : {}),
    },
  };
}

/** "series 1–2.950" / "series 100–250" / "todas las series". */
export function rangeText(range: SerialRange, total: number | null): string {
  const from = range.fromSerial ?? 1;
  const to = range.toSerial ?? total;
  if (range.fromSerial === undefined && range.toSerial === undefined) return "todas las series";
  return to != null ? `series ${from}–${to}` : `desde la serie ${from}`;
}

export type CodeFilters = { status: BottleUnitStatus | "ALL"; from: string; to: string };

export const EMPTY_CODE_FILTERS: CodeFilters = { status: "ALL", from: "", to: "" };

/** Filtros de la tabla → `GET /v1/lots/{id}/bottle-codes` (pagina y filtra el servidor). */
export function bottleCodeQuery(f: CodeFilters, page: { limit: number; offset: number }): BottleCodeQuery {
  const range = parseSerialRange({ from: f.from, to: f.to });
  return {
    ...page,
    ...(f.status !== "ALL" ? { status: f.status } : {}),
    ...(range.ok ? range.range : {}),
  };
}

/** Texto de la relación de un código con su sustituto o con el que sustituye. */
export function replacementText(u: Pick<BottleUnit, "voided" | "replaces">): string | null {
  if (u.voided?.replacedBy) return `Sustituido por ${u.voided.replacedBy}`;
  if (u.replaces) return `Sustituye a ${u.replaces}`;
  return null;
}
