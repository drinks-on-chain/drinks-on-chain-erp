import {
  CreateTerroirSchema,
  type CreateTerroirDto,
  type TerroirResponse,
  type UpdateTerroirDto,
} from "@drinks-on-chain/mocks";
import { numberToInput, parseDecimal } from "@/lib/format";
import { detailPairs } from "./api-details";
import { outerRing } from "./parcel-shape";

// Valores del formulario de terroir (texto tal como se escribe) y su conversión al DTO de
// alta/edición (09 §3), con la misma validación que el backend (CreateTerroirSchema).

export type TerroirFormValues = {
  parcelName: string;
  cadastreCode: string;
  surfaceHectares: string;
  altitudeMasl: string;
  latitude: string;
  longitude: string;
  rawMaterialType: string;
  varietyName: string;
  soilType: string;
  irrigationSystem: string;
  isDoEligible: boolean;
  doType: string;
  polygon: string;
  doCertificateUrl: string | null;
  isActive: boolean;
};

export type TerroirField = keyof TerroirFormValues;
export type TerroirFormErrors = Partial<Record<TerroirField, string>>;

export const EMPTY_TERROIR: TerroirFormValues = {
  parcelName: "",
  cadastreCode: "",
  surfaceHectares: "",
  altitudeMasl: "",
  latitude: "",
  longitude: "",
  rawMaterialType: "uva",
  varietyName: "",
  soilType: "",
  irrigationSystem: "",
  isDoEligible: false,
  doType: "",
  polygon: "",
  doCertificateUrl: null,
  isActive: true,
};

const str = (v: string | number | null | undefined) => (v == null ? "" : String(v));

/** GeoJSON legible en el textarea: las coordenadas en una línea para no ocupar media pantalla. */
export function formatGeometry(g: TerroirResponse["geographicPolygonGeojson"]): string {
  if (!g) return "";
  const { type, coordinates, ...rest } = g;
  const lines = [`"type": ${JSON.stringify(type)}`, `"coordinates": ${JSON.stringify(coordinates)}`];
  for (const [k, v] of Object.entries(rest)) lines.push(`${JSON.stringify(k)}: ${JSON.stringify(v)}`);
  return `{\n  ${lines.join(",\n  ")}\n}`;
}

export function terroirToValues(t: TerroirResponse): TerroirFormValues {
  return {
    parcelName: t.parcelName,
    cadastreCode: str(t.cadastreCode),
    surfaceHectares: numberToInput(t.surfaceHectares),
    altitudeMasl: numberToInput(t.altitudeMasl),
    latitude: numberToInput(t.latitude),
    longitude: numberToInput(t.longitude),
    rawMaterialType: t.rawMaterialType,
    varietyName: t.varietyName,
    soilType: str(t.soilType),
    irrigationSystem: str(t.irrigationSystem),
    isDoEligible: t.isDoEligible,
    doType: str(t.doType),
    polygon: formatGeometry(t.geographicPolygonGeojson),
    doCertificateUrl: t.doCertificateUrl ?? null,
    isActive: t.isActive,
  };
}

/** Polígono escrito en el textarea: vacío → null; JSON inválido → mensaje de error. */
export function parsePolygon(
  text: string,
): { value: CreateTerroirDto["geographicPolygonGeojson"] } | { error: string } {
  if (!text.trim()) return { value: null };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { error: "No es un JSON válido." };
  }
  const geometry = json as { type?: unknown; coordinates?: unknown };
  if (!geometry || typeof geometry !== "object" || typeof geometry.type !== "string") {
    return { error: 'Falta "type": se espera un objeto GeoJSON { "type": "Polygon", "coordinates": [...] }.' };
  }
  if (!outerRing(geometry as { type: string; coordinates: unknown[] })) {
    return { error: "Debe ser un Polygon o MultiPolygon con al menos 3 vértices [longitud, latitud]." };
  }
  return { value: geometry as NonNullable<CreateTerroirDto["geographicPolygonGeojson"]> };
}

const optionalText = (s: string) => (s.trim() ? s.trim() : null);

type Result =
  { ok: true; create: CreateTerroirDto; update: UpdateTerroirDto } | { ok: false; errors: TerroirFormErrors };

/** Valida el formulario y construye los DTO. `update` añade `isActive` (solo edición). */
export function toTerroirDto(v: TerroirFormValues): Result {
  const errors: TerroirFormErrors = {};
  const surface = parseDecimal(v.surfaceHectares);
  const altitude = parseDecimal(v.altitudeMasl);
  const latitude = parseDecimal(v.latitude, { grouping: false });
  const longitude = parseDecimal(v.longitude, { grouping: false });

  if (!v.parcelName.trim()) errors.parcelName = "Escribe el nombre de la parcela.";
  if (!v.varietyName.trim()) errors.varietyName = "Indica la cepa.";
  if (!v.rawMaterialType.trim()) errors.rawMaterialType = "Indica la materia prima.";
  if (surface == null || surface <= 0) errors.surfaceHectares = "La superficie debe ser mayor que 0.";
  if (altitude == null) errors.altitudeMasl = "Indica la altitud en metros sobre el nivel del mar.";
  else if (altitude < 0 || altitude > 6000) errors.altitudeMasl = "La altitud debe estar entre 0 y 6.000 m.";
  if (v.latitude.trim() && (latitude == null || latitude < -90 || latitude > 90)) {
    errors.latitude = "La latitud va de −90 a 90.";
  }
  if (v.longitude.trim() && (longitude == null || longitude < -180 || longitude > 180)) {
    errors.longitude = "La longitud va de −180 a 180.";
  }
  const polygon = parsePolygon(v.polygon);
  if ("error" in polygon) errors.polygon = polygon.error;
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const create: CreateTerroirDto = {
    parcelName: v.parcelName.trim(),
    cadastreCode: optionalText(v.cadastreCode),
    surfaceHectares: surface!,
    altitudeMasl: altitude!,
    latitude,
    longitude,
    geographicPolygonGeojson: "value" in polygon ? polygon.value : null,
    rawMaterialType: v.rawMaterialType.trim(),
    varietyName: v.varietyName.trim(),
    soilType: optionalText(v.soilType),
    irrigationSystem: optionalText(v.irrigationSystem),
    isDoEligible: v.isDoEligible,
    doType: optionalText(v.doType),
    doCertificateUrl: v.doCertificateUrl,
  };
  // Última red: el mismo esquema que aplica el backend.
  const parsed = CreateTerroirSchema.safeParse(create);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "parcelName") as TerroirField;
      errors[key === ("geographicPolygonGeojson" as TerroirField) ? "polygon" : key] ??= issue.message;
    }
    return { ok: false, errors };
  }
  return { ok: true, create, update: { ...create, isActive: v.isActive } };
}

const FIELD_ALIASES: Record<string, TerroirField> = { geographicPolygonGeojson: "polygon" };

/** Asigna los `details` de un 400/422 ("campo: mensaje") a los campos del formulario. */
export function terroirFieldErrors(details: unknown): TerroirFormErrors {
  const errors: TerroirFormErrors = {};
  const fields = new Set<string>([...Object.keys(EMPTY_TERROIR), ...Object.keys(FIELD_ALIASES)]);
  for (const [field, message] of detailPairs(details)) {
    if (!fields.has(field)) continue;
    const key = FIELD_ALIASES[field] ?? (field as TerroirField);
    errors[key] ??= message;
  }
  return errors;
}
