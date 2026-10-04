"use client";

import { useMemo, useState } from "react";
import { FlaskConical } from "lucide-react";
import type { BatchLabAnalysisResponse, Lot } from "@drinks-on-chain/mocks";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Checkbox,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  FormSection,
  Input,
  KeyValueList,
  Modal,
  ModalClose,
  Skeleton,
  toast,
} from "@drinks-on-chain/ui";
import { RuleViolationNotice } from "@/components/rule-violation-notice";
import { StoredFileLink } from "@/components/stored-file-link";
import { VoidedBadge, VoidedText } from "@/components/voided";
import { isVoided } from "@/lib/erp/voided";
import { UploadField } from "@/features/origen/components/upload-field";
import { toDateInput } from "@/features/vinificacion/form-utils";
import { errorMessage } from "@/lib/api/errors";
import { useMe } from "@/lib/auth/hooks";
import { useCreateLotLabAnalysis, useLotLabAnalyses } from "@/lib/erp/hooks";
import { can } from "@/lib/erp/permissions";
import { today } from "@/lib/erp/today";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { useReturnFocus } from "@/lib/use-return-focus";
import {
  CHECK_RESULT,
  CONFORMITY,
  LAB_ERROR_FIELDS,
  LAB_NUMBER_FIELDS,
  checkValueText,
  emptyLab,
  isCurrentLab,
  labFieldErrors,
  labValueRows,
  limitText,
  parameterLabel,
  sortLabs,
  toLotLabDto,
  type LabErrors,
  type LabField,
  type LabValues,
} from "../lab-model";
import { actorText } from "../lot-timeline";

type Props = { lot: Pick<Lot, "id" | "name" | "lotCode" | "dossierStatus" | "links" | "rules"> };

/**
 * Laboratorio del lote (contrato de la Ola 2 §8): el análisis vigente con la conformidad que
 * calcula el servidor contra los límites de la instantánea del lote (cada parámetro, su límite y
 * su resultado), las cifras con su unidad y el historial de reanálisis. Solo inserción: un
 * análisis nuevo sustituye al anterior.
 */
export function LotLab({ lot }: Props) {
  const me = useMe();
  const labs = useLotLabAnalyses(lot.id);
  const [open, setOpen] = useState(false);
  const items = useMemo(() => sortLabs(labs.data?.items), [labs.data]);
  const current = items.find(isCurrentLab);
  const previous = items.filter((l) => l !== current);

  const bottled = lot.links.bottlingBatchId !== null;
  const closed = lot.dossierStatus === "CLOSED";
  const canCreate = can(me.data, "lab.create") && bottled && !closed;
  const add = canCreate ? (
    <Button variant="secondary" iconStart={<FlaskConical aria-hidden size={16} />} onClick={() => setOpen(true)}>
      {current ? "Registrar reanálisis" : "Registrar análisis"}
    </Button>
  ) : undefined;

  if (labs.isError) {
    return (
      <ErrorState description={errorMessage(labs.error)} onRetry={() => labs.refetch()} retrying={labs.isFetching} />
    );
  }
  if (!labs.data) return <Skeleton shape="block" className="h-80" />;

  return (
    <div className="grid grid-cols-1 gap-6">
      {!current ? (
        <EmptyState
          icon={<FlaskConical aria-hidden size={32} strokeWidth={1.5} />}
          title="Sin análisis de laboratorio"
          description={
            !bottled
              ? "El laboratorio se registra sobre el lote embotellado."
              : closed
                ? "El expediente se cerró sin análisis registrado."
                : "Registra el informe del laboratorio acreditado: el servidor calcula la conformidad con los límites del lote."
          }
          action={add}
        />
      ) : (
        <CurrentAnalysis lab={current} action={add} />
      )}

      {previous.length > 0 && (
        <Card padding="none">
          <CardHeader
            title="Análisis anteriores"
            description="Sustituidos por un reanálisis o anulados con una corrección. Se conservan: nada se edita ni se borra."
            divided
            className="px-5 pt-5"
          />
          <DataTable<BatchLabAnalysisResponse>
            caption={`Análisis anteriores de ${lot.name}`}
            captionHidden
            bleed
            data={previous}
            getRowId={(l) => l.id}
            columns={[
              {
                id: "date",
                header: "Análisis",
                cell: (l) => <VoidedText voided={isVoided(l)}>{fmtDate(l.testPerformedAt)}</VoidedText>,
              },
              {
                id: "lab",
                header: "Laboratorio",
                cell: (l) => <VoidedText voided={isVoided(l)}>{l.certifiedLaboratoryName}</VoidedText>,
              },
              {
                id: "status",
                header: "Conformidad",
                cell: (l) =>
                  l.conformityStatus ? (
                    <Badge tone={CONFORMITY[l.conformityStatus].tone}>{CONFORMITY[l.conformityStatus].label}</Badge>
                  ) : (
                    "—"
                  ),
              },
              {
                id: "superseded",
                header: "Sustituido o anulado",
                hideBelow: "md",
                cell: (l) =>
                  isVoided(l) ? (
                    <span className="flex flex-wrap items-center gap-2">
                      <VoidedBadge at={l.voidedAt} />
                      {l.voidedAt && <span className="text-sm text-fg-muted">{fmtDateTime(l.voidedAt)}</span>}
                    </span>
                  ) : l.supersededAt ? (
                    `Sustituido el ${fmtDateTime(l.supersededAt)}`
                  ) : (
                    "—"
                  ),
              },
              {
                id: "report",
                header: "Informe",
                hideBelow: "md",
                cell: (l) => (
                  <StoredFileLink reference={l.report?.key ?? l.laboratoryReportPdfUrl}>Ver informe</StoredFileLink>
                ),
              },
            ]}
          />
        </Card>
      )}

      {canCreate && <LabForm lot={lot} open={open} onOpenChange={setOpen} />}
    </div>
  );
}

function CurrentAnalysis({ lab, action }: { lab: BatchLabAnalysisResponse; action?: React.ReactNode }) {
  const status = lab.conformity?.status ?? lab.conformityStatus;
  const view = status ? CONFORMITY[status] : null;
  const checks = lab.conformity?.checks ?? [];
  const warnings = lab.conformity?.warnings ?? [];
  const declared = [lab.conformsToEuStandards && "UE", lab.conformsToUsaStandards && "EE. UU."].filter(Boolean);

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Card className="grid grid-cols-1 gap-4">
        <CardHeader
          title="Conformidad del análisis vigente"
          description={
            lab.conformity
              ? `Calculada por el servidor con los límites de la instantánea del lote (reglas del ${fmtDate(lab.conformity.rulesTakenAt)}).`
              : "Calculada por el servidor con los límites del lote."
          }
          action={action}
        />
        {view && (
          <div className="flex flex-wrap items-center gap-3" data-testid="lab-conformity">
            <Badge tone={view.tone} variant="strong">
              {view.label}
            </Badge>
            <span className="text-sm text-fg-muted">{view.detail}</span>
          </div>
        )}
        {checks.length > 0 && (
          <DataTable
            caption="Comprobaciones de la conformidad"
            captionHidden
            data={checks}
            getRowId={(c) => c.parameter}
            columns={[
              { id: "parameter", header: "Parámetro", cell: (c) => parameterLabel(c.parameter) },
              {
                id: "value",
                header: "Medido",
                cell: (c) =>
                  c.value === null ? (
                    <span className="text-fg-muted">No registrado</span>
                  ) : (
                    <span className="tabular-nums">{checkValueText(c)}</span>
                  ),
              },
              { id: "limit", header: "Límite del lote", cell: (c) => limitText(c.limit) },
              {
                id: "result",
                header: "Resultado",
                cell: (c) => <Badge tone={CHECK_RESULT[c.result].tone}>{CHECK_RESULT[c.result].label}</Badge>,
              },
            ]}
          />
        )}
        {warnings.length > 0 && (
          <Alert tone="warning" title={warnings.length === 1 ? "Aviso del análisis" : "Avisos del análisis"}>
            <ul className="m-0 grid list-none gap-1 p-0">
              {warnings.map((w, i) => (
                <li key={`${w.code ?? "aviso"}-${i}`}>{w.message}</li>
              ))}
            </ul>
          </Alert>
        )}
      </Card>

      <Card className="grid grid-cols-1 gap-4">
        <CardHeader title="Informe del laboratorio" />
        <KeyValueList
          items={[
            { term: "Laboratorio", value: lab.certifiedLaboratoryName },
            {
              term: "Acreditación",
              value: <code className="font-mono text-sm">{lab.accreditedLabCertificationCode}</code>,
            },
            { term: "Fecha del análisis", value: fmtDate(lab.testPerformedAt) },
            ...(lab.recordedBy ? [{ term: "Registrado por", value: actorText(lab.recordedBy) }] : []),
            { term: "Registrado el", value: fmtDateTime(lab.createdAt) },
            {
              term: "Declarado por el laboratorio",
              value:
                declared.length > 0
                  ? `Conforme a normas de ${declared.join(" y ")} (sin verificar)`
                  : "Sin declaraciones de otras normas",
            },
          ]}
        />
        <ul aria-label="Resultados del análisis" className="m-0 grid list-none gap-0 p-0">
          {labValueRows(lab).map((row) => (
            <li
              key={row.key}
              className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-border py-2 text-sm last:border-b-0"
            >
              <span>{row.label}</span>
              <span className="text-right">
                <span className="font-medium tabular-nums">{row.value}</span>{" "}
                <span className="text-fg-muted">{row.unit}</span>
              </span>
            </li>
          ))}
        </ul>
        <StoredFileLink reference={lab.report?.key ?? lab.laboratoryReportPdfUrl}>Ver informe firmado</StoredFileLink>
      </Card>
    </div>
  );
}

function LabForm({ lot, open, onOpenChange }: Props & { open: boolean; onOpenChange: (open: boolean) => void }) {
  const create = useCreateLotLabAnalysis();
  const [values, setValues] = useState<LabValues>(() => emptyLab(toDateInput(today())));
  const [errors, setErrors] = useState<LabErrors>({});
  const [uploading, setUploading] = useState(false);
  useReturnFocus(open);
  const busy = create.isPending || uploading;
  const limits = Object.keys(lot.rules.lab.limits).map(parameterLabel);

  const set = <K extends LabField>(key: K, value: LabValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const change = (next: boolean) => {
    if (busy) return;
    if (next) {
      setValues(emptyLab(toDateInput(today())));
      setErrors({});
      create.reset();
    }
    onOpenChange(next);
  };

  async function submit() {
    create.reset();
    const result = toLotLabDto(values);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    try {
      const lab = await create.mutateAsync({ lotId: lot.id, body: result.dto });
      const status = lab.conformity?.status ?? lab.conformityStatus;
      toast({
        title: "Análisis registrado",
        description: status ? `Conformidad calculada: ${CONFORMITY[status].label.toLowerCase()}.` : undefined,
        tone: status === "CONFORMING" ? "success" : "warning",
      });
      onOpenChange(false);
    } catch (err) {
      setErrors(labFieldErrors(err));
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={change}
      dismissible={!busy}
      size="xl"
      title="Registrar análisis de laboratorio"
      description={`${lot.lotCode ?? lot.name}. La conformidad no se declara: la calcula el servidor con los límites del lote${
        limits.length > 0 ? ` (${limits.join(", ")})` : ""
      }.`}
      footer={
        <>
          <ModalClose asChild>
            <Button variant="secondary" size="lg" disabled={busy}>
              Cancelar
            </Button>
          </ModalClose>
          <Button size="lg" loading={create.isPending} disabled={uploading} onClick={submit}>
            Guardar análisis
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-6">
        <FormSection title="Laboratorio" columns={2}>
          <Field label="Laboratorio" required error={errors.certifiedLaboratoryName} className="md:col-span-2">
            <Input
              value={values.certifiedLaboratoryName}
              onChange={(e) => set("certifiedLaboratoryName", e.target.value)}
            />
          </Field>
          <Field label="Código de acreditación" required error={errors.accreditedLabCertificationCode}>
            <Input
              value={values.accreditedLabCertificationCode}
              onChange={(e) => set("accreditedLabCertificationCode", e.target.value)}
            />
          </Field>
          <Field
            label="Fecha del análisis"
            required
            error={errors.testPerformedAt}
            help="No puede ser anterior al embotellado."
          >
            <Input
              type="date"
              value={values.testPerformedAt}
              onChange={(e) => set("testPerformedAt", e.target.value)}
            />
          </Field>
          <Field label="Fecha de solicitud" error={errors.analysisRequestDate} help="Opcional.">
            <Input
              type="date"
              value={values.analysisRequestDate}
              onChange={(e) => set("analysisRequestDate", e.target.value)}
            />
          </Field>
        </FormSection>

        <FormSection
          title="Resultados"
          description="Cada cifra, en la unidad que indica su campo. El metanol puede venir por alcohol anhidro o por litro de producto: el servidor convierte uno en otro."
          columns={2}
        >
          {LAB_NUMBER_FIELDS.map((f) => (
            <Field key={f.key} label={f.label} required={f.required} error={errors[f.key]} help={f.unit}>
              <Input
                numeric
                inputMode="decimal"
                suffix={f.suffix}
                value={values[f.key]}
                onChange={(e) => set(f.key, e.target.value)}
              />
            </Field>
          ))}
        </FormSection>

        <FormSection title="Informe y declaraciones" columns={1}>
          <UploadField
            label="Informe firmado del laboratorio"
            folder="lab-reports"
            value={values.laboratoryReportKey}
            onChange={(key) => set("laboratoryReportKey", key)}
            onBusyChange={setUploading}
            accept="application/pdf"
            help="PDF, hasta 15 MB. Queda como archivo privado del lote."
          />
          {errors.laboratoryReportKey && (
            <p role="alert" className="m-0 text-sm text-danger-text">
              {errors.laboratoryReportKey}
            </p>
          )}
          <div className="grid grid-cols-1 gap-2">
            <Checkbox
              label="El laboratorio declara conformidad con normas de la UE"
              description="Declaración del laboratorio: no se verifica ni sale en el pasaporte."
              checked={values.conformsToEuStandards}
              onCheckedChange={(c) => set("conformsToEuStandards", c === true)}
            />
            <Checkbox
              label="El laboratorio declara conformidad con normas de EE. UU."
              checked={values.conformsToUsaStandards}
              onCheckedChange={(c) => set("conformsToUsaStandards", c === true)}
            />
          </div>
        </FormSection>

        <RuleViolationNotice error={create.error} fields={LAB_ERROR_FIELDS} />
      </div>
    </Modal>
  );
}
