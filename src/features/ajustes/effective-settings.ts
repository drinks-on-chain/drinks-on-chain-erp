import type { EffectiveSetting } from "@drinks-on-chain/mocks";
import { labParameterLabel } from "@/lib/erp/labels";
import { fmtNumber } from "@/lib/format";

// Configuración efectiva de la bodega (contrato de la Ola 1 §6, `GET /v1/organizations/current/settings`):
// valor que aplica y si es el estándar de Drinks on Chain o propio de la bodega. Solo lectura: los
// ajustes por bodega los fija el back office.

/** Unidad a partir del nombre del parámetro (la respuesta de la bodega no trae el tipo ni la unidad). */
const UNITS: [RegExp, string][] = [
  [/Msnm$/, "m s. n. m."],
  [/Porcentaje$/, "%"],
  [/dias/i, "días"],
  [/Meses$/, "meses"],
  [/horas/i, "h"],
  [/minutos/i, "min"],
  [/Botellas/, "botellas"],
];

const ENUM_LABELS: Record<string, string> = {
  BURN: "Quemar",
  EXTEND: "Extender el plazo",
  COMPENSATE: "Compensar",
  DISABLED: "Desactivado",
  OPTIONAL: "Opcional",
  REQUIRED: "Obligatorio",
};

export const SETTING_GROUPS: Record<string, string> = {
  trazabilidad: "Trazabilidad",
  precio: "Precio",
  compra: "Compra",
  canje: "Canje",
  puntos: "Puntos de canje",
  equipo: "Equipo",
  tokenizacion: "Tokenización",
  invitacion: "Invitaciones",
  campanas: "Campañas",
};

export const APPLIES_AT: Record<EffectiveSetting["appliesAt"], string> = {
  LOT: "A los lotes nuevos",
  COLLECTION: "A las colecciones nuevas",
  IMMEDIATE: "De inmediato",
};

export const settingGroup = (key: string) => SETTING_GROUPS[key.split(".")[0] ?? ""] ?? "Otros";

export function settingUnit(key: string): string | null {
  const last = key.split(".").pop() ?? key;
  return UNITS.find(([re]) => re.test(last))?.[1] ?? null;
}

const scalar = (v: unknown): string => {
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (typeof v === "number") return fmtNumber(v, Number.isInteger(v) ? 0 : 2);
  if (typeof v === "string") return ENUM_LABELS[v] ?? v;
  return JSON.stringify(v);
};

/**
 * Valor legible: booleanos como Sí/No, cifras en es-BO con su unidad, listas separadas por comas,
 * objetos como "clave: valor" (límites de laboratorio) y `null` como "Sin límite" en los máximos.
 */
export function formatSettingValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return /max|limite/i.test(key) ? "Sin límite" : "Sin definir";
  if (Array.isArray(value)) return value.length ? value.map(scalar).join(", ") : "Ninguno";
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => {
        const name = labParameterLabel(k);
        if (v && typeof v === "object" && ("max" in v || "min" in v)) {
          const { min, max, unidad } = v as { min?: unknown; max?: unknown; unidad?: unknown };
          const unit = typeof unidad === "string" ? ` ${unidad}` : "";
          const range = [
            min !== undefined && min !== null ? `mín. ${scalar(min)}` : null,
            max !== undefined && max !== null ? `máx. ${scalar(max)}` : null,
          ]
            .filter(Boolean)
            .join(" y ");
          return `${name}: ${range}${unit}`;
        }
        return `${name}: ${scalar(v)}`;
      })
      .join(" · ");
  }
  const unit = typeof value === "number" ? settingUnit(key) : null;
  return unit ? `${scalar(value)} ${unit}` : scalar(value);
}

/** Parámetros ordenados por grupo y clave. */
export function sortSettings(settings: readonly EffectiveSetting[]): EffectiveSetting[] {
  return [...settings].sort(
    (a, b) => settingGroup(a.key).localeCompare(settingGroup(b.key), "es") || a.key.localeCompare(b.key),
  );
}
