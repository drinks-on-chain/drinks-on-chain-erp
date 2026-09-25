"use client";

import { useState } from "react";
import { FileCheck2, Plus } from "lucide-react";
import type { BatchLabAnalysisResponse } from "@drinks-on-chain/mocks";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Checkbox,
  EmptyState,
  ErrorState,
  Field,
  FormSection,
  Input,
  KeyValueList,
  SlideOver,
  Skeleton,
  toast,
} from "@drinks-on-chain/ui";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { useMe } from "@/lib/auth/hooks";
import { useCreateLabAnalysis, useLabAnalysis, useUpload } from "@/lib/erp/hooks";
import { can } from "@/lib/erp/permissions";
import { fmtDate, fmtNumber } from "@/lib/format";
import { useReturnFocus } from "@/lib/use-return-focus";
import { ExternalLink } from "@/features/cuenta/stellar";
import { FileInput, fileTooBig } from "./file-input";
import { emptyLabForm, LAB_NUMBER_FIELDS, validateLab, type LabErrors, type LabFormValues } from "./lab-form-model";

const num = (n: number | null | undefined, unit: string, digits = 2) =>
  n === null || n === undefined ? "—" : `${fmtNumber(n, digits)} ${unit}`;

function Conformity({ lab }: { lab: BatchLabAnalysisResponse }) {
  const items: [string, boolean][] = [
    ["SENASAG", lab.conformsToSenasagStandards],
    ["UE", lab.conformsToEuStandards],
    ["EE. UU.", lab.conformsToUsaStandards],
  ];
  return (
    <span className="flex flex-wrap gap-1.5">
      {items.map(([name, ok]) => (
        <Badge key={name} tone={ok ? "success" : "neutral"} dot={ok}>
          {ok ? `Conforme ${name}` : `${name}: sin dictamen`}
        </Badge>
      ))}
    </span>
  );
}

/** Certificado de laboratorio del lote (09 §3): ver o registrar (404 = sin certificado). */
export function LabCertificateCard({ bottlingId, lotCode }: { bottlingId: string; lotCode: string }) {
  const me = useMe();
  const lab = useLabAnalysis(bottlingId);
  const [open, setOpen] = useState(false);
  useReturnFocus(open);
  const missing = lab.error instanceof ApiError && lab.error.isNotFound;
  const canCreate = can(me.data, "lab.create");

  return (
    <Card className="grid grid-cols-1 gap-4">
      <CardHeader
        title="Certificado de laboratorio"
        description="Análisis del lote embotellado por un laboratorio acreditado (ISO 17025)."
      />
      {lab.isPending ? (
        <Skeleton className="h-40" />
      ) : missing ? (
        <EmptyState
          bare
          icon={<FileCheck2 aria-hidden size={32} strokeWidth={1.5} />}
          title="Sin certificado"
          description="Este lote aún no tiene el informe del laboratorio. El pasaporte público lo mostrará cuando se registre."
          action={
            canCreate ? (
              <Button variant="secondary" iconStart={<Plus aria-hidden size={18} />} onClick={() => setOpen(true)}>
                Registrar certificado
              </Button>
            ) : undefined
          }
        />
      ) : lab.isError ? (
        <ErrorState
          bare
          description={errorMessage(lab.error)}
          onRetry={() => lab.refetch()}
          retrying={lab.isFetching}
        />
      ) : (
        <>
          <KeyValueList
            items={[
              { term: "Laboratorio", value: lab.data.certifiedLaboratoryName },
              {
                term: "Acreditación",
                value: <code className="font-mono text-sm">{lab.data.accreditedLabCertificationCode}</code>,
              },
              { term: "Fecha del análisis", value: fmtDate(lab.data.testPerformedAt) },
              { term: "Grado real", value: num(lab.data.actualAlcoholAbv, "% vol", 1) },
              { term: "Acidez total", value: num(lab.data.totalAcidityTartaricGl, "g/L") },
              { term: "Acidez volátil", value: num(lab.data.volatileAcidityAceticGl, "g/L") },
              ...(lab.data.totalSulfurDioxideMgL != null
                ? [{ term: "SO₂ total", value: num(lab.data.totalSulfurDioxideMgL, "mg/L", 0) }]
                : []),
              ...(lab.data.methanolContentMgL != null
                ? [{ term: "Metanol", value: num(lab.data.methanolContentMgL, "mg/L", 0) }]
                : []),
              { term: "Conformidad", value: <Conformity lab={lab.data} /> },
            ]}
          />
          <ExternalLink href={lab.data.laboratoryReportPdfUrl}>Ver informe en PDF</ExternalLink>
        </>
      )}
      {canCreate && (
        <LabAnalysisSlideOver open={open} onOpenChange={setOpen} bottlingId={bottlingId} lotCode={lotCode} />
      )}
    </Card>
  );
}

function LabAnalysisSlideOver({
  open,
  onOpenChange,
  bottlingId,
  lotCode,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  bottlingId: string;
  lotCode: string;
}) {
  const upload = useUpload();
  const create = useCreateLabAnalysis();
  const [values, setValues] = useState<LabFormValues>(emptyLabForm);
  const [pdf, setPdf] = useState<File | null>(null);
  const [errors, setErrors] = useState<LabErrors>({});
  const pending = upload.isPending || create.isPending;
  const set = (k: keyof LabFormValues) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [k]: e.target.value }));
  const check = (k: "conformsToSenasagStandards" | "conformsToEuStandards" | "conformsToUsaStandards") => ({
    checked: values[k],
    onCheckedChange: (c: boolean | "indeterminate") => setValues((v) => ({ ...v, [k]: c === true })),
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { errors: next, dto } = validateLab(bottlingId, values, !!pdf);
    if (pdf && pdf.type !== "application/pdf") next.pdf = "El informe debe ser un PDF.";
    else if (fileTooBig(pdf)) next.pdf = "El PDF supera los 15 MB.";
    setErrors(next);
    if (!dto || Object.keys(next).length > 0 || !pdf) return;
    try {
      const { url } = await upload.mutateAsync([pdf, "lab-reports"]);
      await create.mutateAsync({ ...dto, laboratoryReportPdfUrl: url });
      toast({ title: `Certificado registrado para ${lotCode}`, tone: "success" });
      onOpenChange(false);
      setValues(emptyLabForm());
      setPdf(null);
    } catch (err) {
      toast({ title: "No se pudo registrar el certificado", description: errorMessage(err), tone: "danger" });
    }
  };

  return (
    <SlideOver
      open={open}
      onOpenChange={(o) => !pending && onOpenChange(o)}
      size="lg"
      title="Registrar certificado"
      description={`Informe del laboratorio para el lote ${lotCode}.`}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" form="lab-form" loading={pending}>
            Guardar certificado
          </Button>
        </>
      }
    >
      <form id="lab-form" noValidate onSubmit={submit} className="grid grid-cols-1 gap-6">
        <FormSection title="Laboratorio" columns={2}>
          <Field label="Laboratorio" required error={errors.certifiedLaboratoryName} className="md:col-span-2">
            <Input value={values.certifiedLaboratoryName} onChange={set("certifiedLaboratoryName")} />
          </Field>
          <Field label="Código de acreditación" required error={errors.accreditedLabCertificationCode}>
            <Input value={values.accreditedLabCertificationCode} onChange={set("accreditedLabCertificationCode")} />
          </Field>
          <Field label="Fecha del análisis" required error={errors.testPerformedAt}>
            <Input type="date" value={values.testPerformedAt} onChange={set("testPerformedAt")} />
          </Field>
          <Field label="Fecha de solicitud" error={errors.analysisRequestDate}>
            <Input type="date" value={values.analysisRequestDate} onChange={set("analysisRequestDate")} />
          </Field>
        </FormSection>
        <FormSection title="Resultados" columns={2}>
          {LAB_NUMBER_FIELDS.map((f) => (
            <Field key={f.key} label={f.label} required={"required" in f && f.required} error={errors[f.key]}>
              <Input numeric inputMode="decimal" suffix={f.unit} value={values[f.key]} onChange={set(f.key)} />
            </Field>
          ))}
        </FormSection>
        <FormSection title="Conformidad e informe">
          <div className="grid grid-cols-1 gap-2">
            <Checkbox label="Conforme a normas SENASAG" {...check("conformsToSenasagStandards")} />
            <Checkbox label="Conforme a normas de la UE" {...check("conformsToEuStandards")} />
            <Checkbox label="Conforme a normas de EE. UU." {...check("conformsToUsaStandards")} />
          </div>
          <Field label="Informe en PDF" required help="Hasta 15 MB." error={errors.pdf}>
            <FileInput accept="application/pdf" onFile={setPdf} />
          </Field>
        </FormSection>
      </form>
    </SlideOver>
  );
}
