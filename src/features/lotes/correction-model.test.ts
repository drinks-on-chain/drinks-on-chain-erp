import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/errors";
import {
  NODE_TARGET,
  changeText,
  correctableFields,
  correctionErrors,
  emptyCorrection,
  isVoidable,
  toCorrectionDto,
} from "./correction-model";

const harvest = { type: "HARVEST_BATCH", id: "h1" } as const;
const REASON = "La báscula marcó de más al pesar";

describe("campos corregibles", () => {
  it("son los de la lista cerrada del contrato, con su etiqueta y unidad", () => {
    expect(correctableFields("HARVEST_BATCH").map((f) => f.key)).toEqual([
      "grossWeightKg",
      "tareWeightKg",
      "intakeDate",
      "temperatureAtIntakeC",
      "notes",
    ]);
    expect(correctableFields("WINE_AGING")[0]).toEqual({
      key: "plannedMonths",
      label: "Meses de crianza",
      kind: "integer",
      unit: "meses",
    });
    // El remanente del embotellado es un objeto: no se ofrece en el formulario.
    expect(correctableFields("BOTTLING").map((f) => f.key)).toEqual(["finalAlcoholAbv", "bottleType"]);
    expect(correctableFields("PHYTO_DECISION")).toEqual([]);
  });

  it("solo se anulan análisis, dictámenes, lecturas y tratamientos", () => {
    expect(isVoidable("LAB_ANALYSIS")).toBe(true);
    expect(isVoidable("PHYTO_DECISION")).toBe(true);
    expect(isVoidable("HARVEST_BATCH")).toBe(false);
    expect(isVoidable("BOTTLING")).toBe(false);
  });

  it("cada nodo del grafo tiene su tipo de registro", () => {
    expect(NODE_TARGET.TANK).toBe("FERMENTATION_TANK");
    expect(NODE_TARGET.DISTILLATION).toBe("PRODUCTION_BATCH");
  });
});

describe("diálogo de corrección", () => {
  it("envía solo los campos con valor nuevo, en es-BO", () => {
    const r = toCorrectionDto(harvest, {
      kind: "AMEND",
      changes: { grossWeightKg: "18.600", tareWeightKg: "", intakeDate: "2026-03-08", notes: " Camión 2 " },
      reason: ` ${REASON} `,
    });
    expect(r).toEqual({
      ok: true,
      dto: {
        target: harvest,
        kind: "AMEND",
        reason: REASON,
        changes: { grossWeightKg: 18600, intakeDate: "2026-03-08", notes: "Camión 2" },
      },
    });
  });

  it("exige algún valor nuevo y un motivo de al menos 10 caracteres", () => {
    const empty = toCorrectionDto(harvest, emptyCorrection());
    expect(empty.ok).toBe(false);
    if (!empty.ok) {
      expect(empty.errors.changes).toBe("Indica al menos un valor nuevo.");
      expect(empty.errors.reason).toMatch(/al menos 10/);
    }
    const bad = toCorrectionDto(
      { type: "WINE_AGING", id: "a1" },
      { kind: "AMEND", changes: { plannedMonths: "6,5", volumeLiters: "-3" }, reason: REASON },
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(Object.keys(bad.errors.fields).sort()).toEqual(["plannedMonths", "volumeLiters"]);
  });

  it("una anulación no lleva cambios", () => {
    const r = toCorrectionDto(
      { type: "LAB_ANALYSIS", id: "l1" },
      { kind: "VOID", changes: { copperContentMgL: "3" }, reason: REASON },
    );
    expect(r).toEqual({ ok: true, dto: { target: { type: "LAB_ANALYSIS", id: "l1" }, kind: "VOID", reason: REASON } });
  });

  it("reparte los errores del servidor entre el motivo y los campos", () => {
    const error = new ApiError({
      status: 422,
      code: "TRC_CORRECTION_FIELD_NOT_CORRECTABLE",
      message: "Campos no corregibles",
      details: [
        { field: "changes.grossWeightKg", message: "El peso bruto no puede ser menor que la tara" },
        { field: "reason", message: "Motivo demasiado corto" },
      ],
    });
    expect(correctionErrors(error)).toEqual({
      fields: { grossWeightKg: "El peso bruto no puede ser menor que la tara" },
      reason: "Motivo demasiado corto",
    });
  });
});

describe("texto de un cambio", () => {
  it("valor anterior → valor nuevo, con unidad y fecha legible", () => {
    expect(changeText({ field: "grossWeightKg", before: 18550, after: 18600 })).toBe(
      "Peso bruto: 18.550 kg → 18.600 kg",
    );
    expect(changeText({ field: "intakeDate", before: "2026-03-09T00:00:00Z", after: "2026-03-08T00:00:00Z" })).toBe(
      "Fecha del pesaje: 9 mar 2026 → 8 mar 2026",
    );
    expect(changeText({ field: "bottleType", before: null, after: "Bordelesa" })).toBe(
      "Tipo de botella: sin valor → Bordelesa",
    );
  });
});
