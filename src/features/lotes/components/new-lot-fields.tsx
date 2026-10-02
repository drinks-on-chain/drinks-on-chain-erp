"use client";

import type { TerroirResponse } from "@drinks-on-chain/mocks";
import { Checkbox, Field, Input, Select, Textarea } from "@drinks-on-chain/ui";
import { fmtNumber } from "@/lib/format";
import type { LotFormErrors, LotFormField, LotFormValues } from "../lot-model";

const PRODUCT_OPTIONS = [
  { value: "UNDECIDED", label: "Se decide al completar la fermentación" },
  { value: "SINGANI", label: "Singani" },
  { value: "WINE", label: "Vino" },
];

type Props = {
  values: LotFormValues;
  errors: LotFormErrors;
  onChange: <K extends LotFormField>(key: K, value: LotFormValues[K]) => void;
  /** Parcelas de la bodega para el origen previsto; sin ellas no se ofrece el campo. */
  terroirs?: TerroirResponse[];
  /** Dentro del pesaje o del tanque: sin origen previsto, fecha ni notas (los da el propio registro). */
  compact?: boolean;
  /** La añada viene del pesaje o del tanque: no se pregunta. */
  hideYear?: boolean;
};

/**
 * Campos de un lote nuevo (`CreateLotBody`, contrato de la Ola 2 §2.4), compartidos por el alta en
 * origen y por el lote que nace desde el pesaje o desde el tanque (`newLot`).
 */
export function NewLotFields({ values, errors, onChange, terroirs, compact = false, hideYear = false }: Props) {
  const text = (key: Exclude<LotFormField, "plannedTerroirIds" | "productType">) => ({
    name: `lot-${key}`,
    value: values[key],
    onChange: (e: { target: { value: string } }) => onChange(key, e.target.value),
  });
  const toggleTerroir = (id: string, checked: boolean) =>
    onChange(
      "plannedTerroirIds",
      checked ? [...values.plannedTerroirIds, id] : values.plannedTerroirIds.filter((x) => x !== id),
    );

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field
        label="Nombre del lote"
        required
        error={errors.name}
        help="Como lo conocerá la bodega, p. ej. Singani Gran Reserva 2026."
        className="md:col-span-2"
      >
        <Input {...text("name")} autoComplete="off" />
      </Field>
      {!hideYear && (
        <Field label="Añada" required error={errors.harvestYear}>
          <Input {...text("harvestYear")} numeric inputMode="numeric" />
        </Field>
      )}
      <Field
        label="Tipo de producto"
        error={errors.productType}
        help="Declarado ya, la D.O. Singani se comprueba desde el primer pesaje. Una vez fijado no cambia."
      >
        <Select
          value={values.productType || "UNDECIDED"}
          onValueChange={(v) => onChange("productType", v === "UNDECIDED" ? "" : (v as LotFormValues["productType"]))}
          options={PRODUCT_OPTIONS}
        />
      </Field>
      <Field
        label="Botellas estimadas"
        error={errors.estimatedBottles}
        help="Opcional. La declara la bodega; el servidor calcula además su proyección."
      >
        <Input {...text("estimatedBottles")} numeric suffix="botellas" />
      </Field>
      <Field label="Formato previsto" error={errors.plannedFormatCl} help="Opcional.">
        <Input {...text("plannedFormatCl")} numeric suffix="cL" />
      </Field>
      <Field label="Grado previsto de la botella" error={errors.targetAbvPercent} help="Opcional.">
        <Input {...text("targetAbvPercent")} numeric inputMode="text" suffix="% vol" />
      </Field>
      {!compact && (
        <>
          <Field label="Fecha prevista de salida" error={errors.targetReadyDate} help="Opcional, informativa.">
            <Input {...text("targetReadyDate")} type="date" />
          </Field>
          {terroirs && terroirs.length > 0 && (
            <fieldset className="m-0 grid gap-2 border-0 p-0 md:col-span-2">
              <legend className="mb-1 p-0 font-ui text-sm font-medium">Parcelas previstas</legend>
              <p className="m-0 text-sm text-fg-muted">
                Opcional. En un lote de singani, el servidor comprueba su aptitud D.O. al crearlo.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {terroirs.map((t) => (
                  <Checkbox
                    key={t.id}
                    checked={values.plannedTerroirIds.includes(t.id)}
                    onCheckedChange={(c) => toggleTerroir(t.id, c === true)}
                    label={t.parcelName}
                    description={`${t.varietyName} · ${fmtNumber(t.altitudeMasl)} m s. n. m.`}
                  />
                ))}
              </div>
              {errors.plannedTerroirIds && (
                <p role="alert" className="m-0 text-sm text-danger-text">
                  {errors.plannedTerroirIds}
                </p>
              )}
            </fieldset>
          )}
          <Field label="Notas" error={errors.notes} help="Opcional." className="md:col-span-2">
            <Textarea {...text("notes")} rows={3} />
          </Field>
        </>
      )}
    </div>
  );
}
