"use client";

import { useState, type FormEvent } from "react";
import type { TreatmentType } from "@drinks-on-chain/mocks";
import { Button, Field, Input, Select, SlideOver, Textarea, toast } from "@drinks-on-chain/ui";
import { useAddTreatment } from "@/lib/erp/hooks";
import { TREATMENT_TYPE } from "@/lib/erp/labels";
import { today } from "@/lib/erp/today";
import { fmtNumber, parseDecimal } from "@/lib/format";
import { hasErrors, toDateInput } from "../form-utils";
import { suggestedTotalG, validateTreatment, type TreatmentField, type TreatmentValues } from "../tank-model";
import { FormErrorAlert } from "./form-error";
import { useReturnFocus } from "@/lib/use-return-focus";
import { fieldErrorsFrom } from "@/lib/api/field-errors";

const empty = (): TreatmentValues => ({
  treatmentType: "",
  additiveName: "",
  additiveSupplier: "",
  dosageAppliedGPerHl: "",
  totalAppliedG: "",
  regulatoryAuthCode: "",
  appliedAt: toDateInput(today()),
  notes: "",
});

const TYPE_OPTIONS = Object.entries(TREATMENT_TYPE).map(([value, label]) => ({ value, label }));

/** Campos del formulario que el backend puede marcar en un 422. */
const SERVER_FIELDS: readonly TreatmentField[] = [
  "treatmentType",
  "additiveName",
  "dosageAppliedGPerHl",
  "totalAppliedG",
  "regulatoryAuthCode",
  "appliedAt",
];

/** "Registrar tratamiento" (09 §3 fila 4.2): tipo SENASAG, aditivo, dosis y código regulatorio. */
export function TreatmentForm({
  tankId,
  tankCode,
  volumeLiters,
  open,
  onOpenChange,
}: {
  tankId: string;
  tankCode: string;
  volumeLiters: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const addTreatment = useAddTreatment();
  // 422 del backend: cada mensaje junto a su campo (details[].field).
  const server = fieldErrorsFrom(addTreatment.error, SERVER_FIELDS).fieldErrors;
  const [values, setValues] = useState<TreatmentValues>(empty);
  useReturnFocus(open);
  const [errors, setErrors] = useState<Partial<Record<TreatmentField, string>>>({});

  const setValue = (k: TreatmentField, value: string) => {
    setValues((v) => ({ ...v, [k]: value }));
    setErrors((x) => ({ ...x, [k]: undefined }));
  };
  const set = (k: TreatmentField) => (e: { target: { value: string } }) => setValue(k, e.target.value);

  const close = (next: boolean) => {
    if (addTreatment.isPending) return;
    if (!next) {
      setValues(empty());
      setErrors({});
      addTreatment.reset();
    }
    onOpenChange(next);
  };

  const dose = parseDecimal(values.dosageAppliedGPerHl);
  const suggestion = dose !== null && volumeLiters ? suggestedTotalG(dose, volumeLiters) : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const found = validateTreatment(values, today());
    setErrors(found);
    if (hasErrors(found)) return;
    addTreatment.mutate(
      {
        id: tankId,
        body: {
          treatmentType: values.treatmentType as TreatmentType,
          additiveName: values.additiveName.trim(),
          additiveSupplier: values.additiveSupplier.trim() || null,
          dosageAppliedGPerHl: dose!,
          totalAppliedG: parseDecimal(values.totalAppliedG) ?? suggestion,
          regulatoryAuthCode: values.regulatoryAuthCode.trim(),
          appliedAt: values.appliedAt,
          notes: values.notes.trim() || null,
        },
      },
      {
        onSuccess: () => {
          toast({
            title: "Tratamiento registrado",
            description: `${TREATMENT_TYPE[values.treatmentType as TreatmentType]} en ${tankCode}`,
            tone: "success",
          });
          close(false);
        },
      },
    );
  };

  return (
    <SlideOver
      open={open}
      onOpenChange={close}
      title="Registrar tratamiento"
      description={`Tratamiento enológico en ${tankCode}, con su autorización SENASAG`}
      size="md"
      dismissible={!addTreatment.isPending}
      footer={
        <>
          <Button variant="secondary" size="xl" onClick={() => close(false)} disabled={addTreatment.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form="tank-treatment-form" size="xl" loading={addTreatment.isPending}>
            Guardar tratamiento
          </Button>
        </>
      }
    >
      <form id="tank-treatment-form" className="grid grid-cols-1 gap-5" onSubmit={submit} noValidate>
        <Field label="Tipo de tratamiento" required error={errors.treatmentType ?? server.treatmentType}>
          <Select
            size="lg"
            placeholder="Elige el tipo"
            options={TYPE_OPTIONS}
            value={values.treatmentType || undefined}
            onValueChange={(v) => setValue("treatmentType", v)}
          />
        </Field>
        <Field
          label="Aditivo"
          required
          error={errors.additiveName ?? server.additiveName}
          help="Nombre comercial o compuesto."
        >
          <Input size="lg" value={values.additiveName} onChange={set("additiveName")} />
        </Field>
        <Field label="Proveedor">
          <Input size="lg" value={values.additiveSupplier} onChange={set("additiveSupplier")} />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Dosis" required error={errors.dosageAppliedGPerHl ?? server.dosageAppliedGPerHl}>
            <Input
              size="lg"
              numeric
              suffix="g/hL"
              value={values.dosageAppliedGPerHl}
              onChange={set("dosageAppliedGPerHl")}
            />
          </Field>
          <Field
            label="Total aplicado"
            error={errors.totalAppliedG ?? server.totalAppliedG}
            help={suggestion !== null ? `Según el volumen del tanque: ${fmtNumber(suggestion, 1)} g.` : undefined}
          >
            <Input
              size="lg"
              numeric
              suffix="g"
              value={values.totalAppliedG}
              placeholder={suggestion !== null ? fmtNumber(suggestion, 1) : undefined}
              onChange={set("totalAppliedG")}
            />
          </Field>
        </div>
        <Field
          label="Código de autorización"
          required
          error={errors.regulatoryAuthCode ?? server.regulatoryAuthCode}
          help="Registro SENASAG del aditivo, p. ej. SENASAG-REG-ADD-2024-88."
        >
          <Input size="lg" value={values.regulatoryAuthCode} onChange={set("regulatoryAuthCode")} />
        </Field>
        <Field label="Fecha de aplicación" required error={errors.appliedAt ?? server.appliedAt}>
          <Input size="lg" type="date" value={values.appliedAt} onChange={set("appliedAt")} />
        </Field>
        <Field label="Notas">
          <Textarea value={values.notes} onChange={set("notes")} rows={2} />
        </Field>
        <FormErrorAlert error={addTreatment.error} fields={SERVER_FIELDS} />
      </form>
    </SlideOver>
  );
}
