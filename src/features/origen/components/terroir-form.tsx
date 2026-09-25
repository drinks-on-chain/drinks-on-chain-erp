"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Button, Checkbox, Field, FormSection, Input, Textarea, toast } from "@drinks-on-chain/ui";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { useCreateTerroir, useTerroirs, useUpdateTerroir } from "@/lib/erp/hooks";
import { fmtNumber, parseDecimal } from "@/lib/format";
import { DO_MIN_ALTITUDE_MASL, DO_VARIETY, doEligibility, doReasonText } from "../do-eligibility";
import {
  parsePolygon,
  terroirFieldErrors,
  toTerroirDto,
  type TerroirField,
  type TerroirFormErrors,
  type TerroirFormValues,
} from "../terroir-form-values";
import { DoBadge } from "./do-badge";
import { ParcelMap } from "./parcel-map";
import { UploadField } from "./upload-field";

const POLYGON_EXAMPLE = `{
  "type": "Polygon",
  "coordinates": [[[-64.69, -21.56], [-64.686, -21.56], [-64.686, -21.557], [-64.69, -21.56]]]
}`;

type Props =
  | { mode: "create"; initial: TerroirFormValues; terroirId?: undefined }
  | { mode: "edit"; initial: TerroirFormValues; terroirId: string };

/** Alta y edición de terroir (09 §3): vista previa del badge D.O. mientras se escribe. */
export function TerroirForm({ mode, initial, terroirId }: Props) {
  const router = useRouter();
  const create = useCreateTerroir();
  const update = useUpdateTerroir();
  const terroirs = useTerroirs();
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<TerroirFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const set = <K extends TerroirField>(key: K, value: TerroirFormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[key])
      setErrors((e) => {
        const next = { ...e };
        delete next[key];
        return next;
      });
  };
  const text = (key: TerroirField) => ({
    name: key,
    value: values[key] as string,
    onChange: (e: { target: { value: string } }) => set(key, e.target.value),
  });

  // Vista previa D.O. con lo escrito (la regla también la valida el backend).
  const preview = {
    varietyName: values.varietyName,
    altitudeMasl: parseDecimal(values.altitudeMasl),
    isDoEligible: values.isDoEligible,
  };
  const eligibility = doEligibility(preview);
  const declaredButFails = values.isDoEligible && !eligibility.eligible;
  const polygon = parsePolygon(values.polygon);

  const varieties = useMemo(() => {
    const names = new Set([DO_VARIETY, ...(terroirs.data?.items ?? []).map((t) => t.varietyName)]);
    return [...names].sort((a, b) => a.localeCompare(b, "es"));
  }, [terroirs.data]);

  const pending = create.isPending || update.isPending;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const result = toTerroirDto(values);
    if (!result.ok) {
      setErrors(result.errors);
      setFormError("Revisa los campos marcados.");
      return;
    }
    try {
      const saved =
        mode === "create"
          ? await create.mutateAsync(result.create)
          : await update.mutateAsync({ id: terroirId, body: result.update });
      toast({
        title: mode === "create" ? "Terroir registrado" : "Cambios guardados",
        description: saved.parcelName,
        tone: "success",
      });
      router.push(`/origen/${saved.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.isValidation) {
        setErrors(terroirFieldErrors(err.details));
        setFormError(err.message);
      } else {
        toast({ title: "No se pudo guardar", description: errorMessage(err), tone: "danger" });
      }
    }
  }

  return (
    <form
      noValidate
      onSubmit={onSubmit}
      className="grid gap-8"
      aria-label={mode === "create" ? "Nuevo terroir" : "Editar terroir"}
    >
      <FormSection title="Parcela" columns={2}>
        <Field label="Nombre de la parcela" required error={errors.parcelName} help="P. ej. Parcela 6 · La Cumbre">
          <Input {...text("parcelName")} autoComplete="off" />
        </Field>
        <Field label="Código catastral" error={errors.cadastreCode}>
          <Input {...text("cadastreCode")} autoComplete="off" />
        </Field>
        <Field label="Superficie" required error={errors.surfaceHectares}>
          <Input {...text("surfaceHectares")} numeric suffix="ha" />
        </Field>
        <Field
          label="Altitud"
          required
          error={errors.altitudeMasl}
          help={`La D.O. Singani exige al menos ${fmtNumber(DO_MIN_ALTITUDE_MASL)} m.`}
        >
          <Input {...text("altitudeMasl")} numeric suffix="m s. n. m." />
        </Field>
        <Field label="Cepa" required error={errors.varietyName} help="Elige una de la lista o escribe otra.">
          <Input {...text("varietyName")} list="terroir-varieties" autoComplete="off" />
        </Field>
        <datalist id="terroir-varieties">
          {varieties.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
        <Field label="Materia prima" required error={errors.rawMaterialType}>
          <Input {...text("rawMaterialType")} autoComplete="off" />
        </Field>
        <Field label="Tipo de suelo" error={errors.soilType}>
          <Input {...text("soilType")} autoComplete="off" />
        </Field>
        <Field label="Sistema de riego" error={errors.irrigationSystem}>
          <Input {...text("irrigationSystem")} autoComplete="off" />
        </Field>
        {mode === "edit" && (
          <Checkbox
            checked={values.isActive}
            onCheckedChange={(c) => set("isActive", c === true)}
            label="Parcela activa"
            description="Las parcelas inactivas no aparecen en el pesaje."
          />
        )}
      </FormSection>

      <FormSection title="Ubicación" description="Coordenadas en grados decimales (WGS 84)." columns={2}>
        <Field label="Latitud" error={errors.latitude} help="Negativa en el hemisferio sur, p. ej. −21,561">
          <Input {...text("latitude")} numeric inputMode="text" suffix="°" />
        </Field>
        <Field label="Longitud" error={errors.longitude} help="Negativa al oeste, p. ej. −64,688">
          <Input {...text("longitude")} numeric inputMode="text" suffix="°" />
        </Field>
        <div className="grid gap-4 md:col-span-2 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Field
            label="Polígono GeoJSON"
            error={errors.polygon ?? ("error" in polygon ? polygon.error : undefined)}
            help="Opcional. Un objeto Polygon con vértices [longitud, latitud]; se valida al escribir."
          >
            <Textarea
              {...text("polygon")}
              rows={6}
              spellCheck={false}
              placeholder={POLYGON_EXAMPLE}
              className="font-mono text-xs"
            />
          </Field>
          <div className="grid content-start gap-1">
            <span className="font-ui text-sm font-medium">Vista previa</span>
            <ParcelMap geometry={"value" in polygon ? polygon.value : null} className="h-36" />
          </div>
        </div>
      </FormSection>

      <FormSection title="Denominación de origen" columns={2}>
        <div className="grid content-start gap-3 md:col-span-2">
          <Checkbox
            checked={values.isDoEligible}
            onCheckedChange={(c) => set("isDoEligible", c === true)}
            label="Parcela apta para D.O."
            description={`Singani D.O.: ${DO_VARIETY} y altitud de ${fmtNumber(DO_MIN_ALTITUDE_MASL)} m o más.`}
          />
          <div className="flex flex-wrap items-center gap-2" aria-live="polite">
            <span className="text-sm text-fg-muted">Vista previa:</span>
            <DoBadge {...preview} explain />
          </div>
          {declaredButFails && (
            <Alert tone="warning" title="La parcela no cumple la regla de la D.O. Singani">
              Falla por: {eligibility.reasons.map(doReasonText).join(", ")}. Puedes guardarla así, pero el backend
              rechazará la destilación D.O. de sus lotes.
            </Alert>
          )}
        </div>
        <Field label="Tipo de D.O." error={errors.doType} help="P. ej. D.O. Singani o Valles Altos de Bolivia.">
          <Input {...text("doType")} autoComplete="off" />
        </Field>
        <UploadField
          label="Certificado D.O."
          folder="certificates"
          value={values.doCertificateUrl}
          onChange={(url) => set("doCertificateUrl", url)}
          onBusyChange={setUploading}
          help="PDF o imagen, hasta 15 MB."
        />
      </FormSection>

      {formError && (
        <Alert tone="danger" title="No se pudo guardar">
          {formError}
        </Alert>
      )}

      <div className="flex flex-wrap justify-end gap-3 border-t border-border pt-5">
        <Button asChild variant="secondary" size="lg">
          <Link href={mode === "create" ? "/origen" : `/origen/${terroirId}`}>Cancelar</Link>
        </Button>
        <Button type="submit" size="lg" loading={pending} disabled={uploading}>
          {mode === "create" ? "Crear terroir" : "Guardar cambios"}
        </Button>
      </div>
    </form>
  );
}
