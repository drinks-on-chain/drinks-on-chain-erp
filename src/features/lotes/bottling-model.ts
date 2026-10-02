import {
  CreateLotBottlingSchema,
  type CreateLotBottlingDto,
  type Lot,
  type LotLockInfo,
  type ProductionBatchResponse,
  type WineAgingResponse,
} from "@drinks-on-chain/mocks";
import { fieldErrorsFrom } from "@/lib/api/field-errors";
import { omitNulls, type Nullable } from "@/lib/erp/omit-nulls";
import { parseDecimal } from "@/lib/format";

// Embotellado del lote (contrato de la Ola 2 §6): una sola vez por lote, con todas sus fuentes
// abiertas. El tipo de producto no se envía (se deriva del origen) y los candados, el balance de
// volumen, la merma tolerada y el balance de alcohol los evalúa el servidor: la pantalla pide la
// vista previa (`POST …/bottling/preview`) y muestra lo que devuelve. Aquí solo va la forma.

export type BottlingValues = {
  bottlingDate: string;
  packagingFormatCl: string;
  totalBottlesPackaged: string;
  finalAlcoholAbv: string;
  waterDilutionLiters: string;
  leftoverLiters: string;
  leftoverDisposition: "RETAINED" | "DISCARDED";
  leftoverNotes: string;
  bottleType: string;
  /** `key` de la etiqueta subida con `POST /v1/uploads`. */
  labelDesignKey: string | null;
};

export type BottlingField = keyof BottlingValues;
export type BottlingErrors = Partial<Record<BottlingField, string>>;

/** Valores iniciales: formato y grado previstos al crear el lote, si se declararon. */
export function emptyBottling(today: string, lot: Pick<Lot, "plannedFormatCl" | "targetAbvPercent">): BottlingValues {
  return {
    bottlingDate: today,
    packagingFormatCl: String(lot.plannedFormatCl ?? 75),
    totalBottlesPackaged: "",
    finalAlcoholAbv: lot.targetAbvPercent != null ? String(lot.targetAbvPercent).replace(".", ",") : "",
    waterDilutionLiters: "",
    leftoverLiters: "",
    leftoverDisposition: "RETAINED",
    leftoverNotes: "",
    bottleType: "",
    labelDesignKey: null,
  };
}

type DtoResult = { ok: true; dto: CreateLotBottlingDto } | { ok: false; errors: BottlingErrors };

/** Valores del formulario → `CreateLotBottlingBody`. Sin `sources`: todas las del lote, enteras. */
export function toLotBottlingDto(v: BottlingValues): DtoResult {
  const errors: BottlingErrors = {};
  const format = parseDecimal(v.packagingFormatCl);
  const bottles = parseDecimal(v.totalBottlesPackaged);
  const abv = parseDecimal(v.finalAlcoholAbv, { grouping: false });
  const water = v.waterDilutionLiters.trim() ? parseDecimal(v.waterDilutionLiters) : null;
  const leftover = v.leftoverLiters.trim() ? parseDecimal(v.leftoverLiters) : null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.bottlingDate)) errors.bottlingDate = "Indica la fecha de embotellado.";
  if (format === null || !Number.isInteger(format) || format < 5 || format > 300) {
    errors.packagingFormatCl = "El formato va de 5 a 300 cL, sin decimales.";
  }
  if (bottles === null || !Number.isInteger(bottles) || bottles < 1 || bottles > 100_000) {
    errors.totalBottlesPackaged = "Indica las botellas llenadas: un entero de 1 a 100.000.";
  }
  if (abv === null || abv < 0 || abv > 100) errors.finalAlcoholAbv = "El grado final va de 0 a 100 % vol.";
  if (v.waterDilutionLiters.trim() && (water === null || water < 0)) {
    errors.waterDilutionLiters = "El agua debe ser un número positivo.";
  }
  if (v.leftoverLiters.trim() && (leftover === null || leftover < 0)) {
    errors.leftoverLiters = "El remanente debe ser un número positivo.";
  }
  if (v.leftoverNotes.length > 500) errors.leftoverNotes = "La nota admite hasta 500 caracteres.";
  if (v.bottleType.length > 120) errors.bottleType = "El tipo de botella admite hasta 120 caracteres.";
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const draft: Nullable<CreateLotBottlingDto> = {
    bottlingDate: v.bottlingDate,
    packagingFormatCl: format!,
    totalBottlesPackaged: bottles!,
    finalAlcoholAbv: abv!,
    waterDilutionLiters: water !== null && water > 0 ? water : null,
    leftover:
      leftover !== null && leftover > 0
        ? {
            liters: leftover,
            disposition: v.leftoverDisposition,
            ...(v.leftoverNotes.trim() ? { notes: v.leftoverNotes.trim() } : {}),
          }
        : null,
    bottleType: v.bottleType.trim() || null,
    labelDesignKey: v.labelDesignKey,
  };
  const dto = omitNulls<CreateLotBottlingDto>(draft);
  const parsed = CreateLotBottlingSchema.safeParse(dto);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = bottlingField(issue.path.map(String).join("."));
      if (key) errors[key] ??= issue.message;
    }
    return { ok: false, errors };
  }
  return { ok: true, dto };
}

const FIELD_MAP: Record<string, BottlingField> = {
  "leftover.liters": "leftoverLiters",
  "leftover.disposition": "leftoverDisposition",
  "leftover.notes": "leftoverNotes",
  leftover: "leftoverLiters",
  labelDesignUrl: "labelDesignKey",
};
const FIELDS: readonly BottlingField[] = [
  "bottlingDate",
  "packagingFormatCl",
  "totalBottlesPackaged",
  "finalAlcoholAbv",
  "waterDilutionLiters",
  "leftoverLiters",
  "leftoverDisposition",
  "leftoverNotes",
  "bottleType",
  "labelDesignKey",
];

function bottlingField(field: string): BottlingField | undefined {
  if (FIELD_MAP[field]) return FIELD_MAP[field];
  const root = field.split(".")[0]!;
  return (FIELDS as readonly string[]).includes(root) ? (root as BottlingField) : undefined;
}

/** `details[].field` de un 409/422 del embotellado → campos del formulario. */
export const bottlingFieldErrors = (error: unknown): BottlingErrors =>
  fieldErrorsFrom<BottlingField>(error, bottlingField).fieldErrors;

/** Campo del formulario al que apunta una violación de la vista previa (para marcarlo). */
export const violationField = (field: string | null): BottlingField | undefined =>
  field ? bottlingField(field) : undefined;

// ---------------------------------------------------------------------------
// Fuentes del lote
// ---------------------------------------------------------------------------

export type BottlingSource = {
  id: string;
  kind: "AGING" | "REST";
  /** "Barrica BAR-FR-2024-01" / "Alambique de cobre AL-01". */
  label: string;
  /** Litros aún sin embotellar; `null` si el registro no los trae. */
  liters: number | null;
  /** Grado del corazón (solo destilaciones). */
  abvPercent: number | null;
  /** Candado evaluado por el servidor; `null` en una destilación sin cerrar o sin candado. */
  lock: LotLockInfo | null;
  /** La destilación sigue abierta: aún no tiene corazón. */
  open: boolean;
};

/**
 * Fuentes abiertas del lote: sus crianzas (vino) o sus destilaciones (singani) sin embotellar ni
 * descartar. Todas entran en el embotellado; si alguna no puede, el servidor lo dice en la vista previa.
 */
export function lotBottlingSources(
  lotId: string,
  agings: readonly WineAgingResponse[],
  productions: readonly ProductionBatchResponse[],
): BottlingSource[] {
  const fromAging = agings
    .filter((a) => a.lotId === lotId && (a.agingStatus === "AGING" || a.agingStatus === "READY"))
    .map<BottlingSource>((a) => ({
      id: a.id,
      kind: "AGING",
      label: [a.containerType, a.containerCode].filter(Boolean).join(" "),
      liters: a.availableLiters ?? a.volumeLiters ?? null,
      abvPercent: null,
      lock: a.lock ?? null,
      open: false,
    }));
  const fromRest = productions
    .filter((p) => p.lotId === lotId && p.restStatus !== "BOTTLED" && p.restStatus !== "DISCARDED")
    .map<BottlingSource>((p) => ({
      id: p.id,
      kind: "REST",
      label: p.equipmentIdentifier,
      liters: p.availableLiters ?? p.heartLiters ?? null,
      abvPercent: p.heartAbvPercent ?? null,
      lock: p.lock ?? null,
      open: !p.processEndDate,
    }));
  return [...fromAging, ...fromRest];
}

/**
 * Agua que haría falta para bajar el corazón al grado final (ayuda de cálculo para quien rellena
 * el formulario; el balance de alcohol lo comprueba el servidor). `null` si falta algún dato o el
 * grado final no es menor que el del corazón.
 */
export function suggestedWaterLiters(sources: readonly BottlingSource[], finalAbv: number | null): number | null {
  if (finalAbv === null || finalAbv <= 0) return null;
  const hearts = sources.filter((s) => s.kind === "REST");
  if (hearts.length === 0 || hearts.some((s) => s.liters === null || s.abvPercent === null)) return null;
  const liters = hearts.reduce((sum, s) => sum + s.liters!, 0);
  const pure = hearts.reduce((sum, s) => sum + (s.liters! * s.abvPercent!) / 100, 0);
  const water = (pure / finalAbv) * 100 - liters;
  return water > 0 ? Math.round(water * 10) / 10 : null;
}
