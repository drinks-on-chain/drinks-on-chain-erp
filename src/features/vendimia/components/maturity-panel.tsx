"use client";

import { useMemo, useState } from "react";
import { FlaskConical } from "lucide-react";
import type { HarvestBatchDetail } from "@drinks-on-chain/mocks";
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  Field,
  Input,
  Modal,
  ModalClose,
  Textarea,
  toast,
} from "@drinks-on-chain/ui";
import { RuleViolationNotice } from "@/components/rule-violation-notice";
import { VoidedBadge, VoidedText } from "@/components/voided";
import { CorrectRecordButton } from "@/features/lotes/components/correction-dialog";
import { isVoided } from "@/lib/erp/voided";
import { actorText } from "@/features/lotes/lot-timeline";
import { useCreateMaturityAnalysis } from "@/lib/erp/hooks";
import { today } from "@/lib/erp/today";
import { fmtDateTime, fmtNumber } from "@/lib/format";
import { useReturnFocus } from "@/lib/use-return-focus";
import { LAB_TARGETS, harvestReadings } from "../lab-targets";
import {
  MATURITY_FIELDS,
  emptyMaturity,
  maturityFieldErrors,
  sortAnalyses,
  toMaturityDto,
  type MaturityErrors,
  type MaturityField,
  type MaturityValues,
} from "../maturity";
import { LabReadingCard } from "./lab-reading-card";

/**
 * Análisis de madurez del pesaje (contrato de la Ola 2 §3.3): las lecturas vigentes (las del
 * último análisis), el historial con quién midió y el alta de un análisis nuevo. Solo inserción:
 * uno erróneo se corrige o anula con una corrección, no se edita.
 */
export function MaturityPanel({
  batch,
  canAnalyze,
  lotLabel,
}: {
  batch: HarvestBatchDetail;
  canAnalyze: boolean;
  /** Nombre y referencia del lote del pesaje, para el diálogo de corrección. */
  lotLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const analyses = useMemo(() => sortAnalyses(batch.maturityAnalyses), [batch.maturityAnalyses]);
  // El vigente es el más reciente que no esté anulado: los anulados siguen en el historial.
  const currentId = analyses.find((a) => !isVoided(a))?.id;
  const none = analyses.length === 0;

  const add = canAnalyze ? (
    <Button variant="secondary" iconStart={<FlaskConical aria-hidden size={16} />} onClick={() => setOpen(true)}>
      Registrar análisis
    </Button>
  ) : undefined;

  return (
    <section aria-labelledby="maturity-title" className="grid grid-cols-1 gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="maturity-title" className="m-0 font-ui text-lg font-semibold">
          Análisis de madurez
        </h2>
        {!none && add}
      </div>

      {none ? (
        <EmptyState
          title="Sin análisis de madurez"
          description={
            canAnalyze
              ? "El pesaje se registró sin análisis. Brix, pH y acidez se pueden medir y registrar ahora."
              : "El pesaje se registró sin análisis. Lo registran enología o agronomía."
          }
          action={add}
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            {harvestReadings(batch).map(({ target, value }) => (
              <LabReadingCard key={target.key} target={target} value={value} />
            ))}
          </div>
          <DataTable
            caption={`Historial de análisis de ${batch.harvestBatchCode}`}
            captionHidden
            data={analyses}
            getRowId={(a) => a.id}
            columns={[
              {
                id: "at",
                header: "Medición",
                cell: (a) => (
                  <span className="flex flex-wrap items-center gap-2 whitespace-nowrap">
                    <VoidedText voided={isVoided(a)}>{fmtDateTime(a.measuredAt)}</VoidedText>
                    {a.id === currentId && <Badge tone="success">Vigente</Badge>}
                    {isVoided(a) && <VoidedBadge />}
                    {!isVoided(a) && (a.correctedFields?.length ?? 0) > 0 && <Badge tone="info">Corregido</Badge>}
                  </span>
                ),
              },
              {
                id: "brix",
                header: "Brix",
                numeric: true,
                cell: (a) => <VoidedText voided={isVoided(a)}>{fmtNumber(a.brixDegrees, 1)}</VoidedText>,
              },
              {
                id: "ph",
                header: "pH",
                numeric: true,
                cell: (a) => <VoidedText voided={isVoided(a)}>{fmtNumber(a.ph, 2)}</VoidedText>,
              },
              {
                id: "acidity",
                header: "Acidez g/L",
                numeric: true,
                cell: (a) => <VoidedText voided={isVoided(a)}>{fmtNumber(a.acidityGl, 1)}</VoidedText>,
              },
              {
                id: "by",
                header: "Registrado por",
                hideBelow: "md",
                cell: (a) =>
                  a.source === "MIGRATION" && !a.recordedBy ? "Migrado del pesaje" : actorText(a.recordedBy),
              },
              { id: "notes", header: "Notas", hideBelow: "lg", cell: (a) => a.notes || "—" },
            ]}
            rowActions={(a) => (
              <CorrectRecordButton
                lotId={batch.lotId}
                lotLabel={lotLabel}
                voided={isVoided(a)}
                record={{ id: a.id, type: "MATURITY_ANALYSIS", label: `Análisis del ${fmtDateTime(a.measuredAt)}` }}
              />
            )}
          />
        </>
      )}

      {canAnalyze && <MaturityForm batch={batch} open={open} onOpenChange={setOpen} />}
    </section>
  );
}

function MaturityForm({
  batch,
  open,
  onOpenChange,
}: {
  batch: HarvestBatchDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const create = useCreateMaturityAnalysis();
  const [values, setValues] = useState<MaturityValues>(() => emptyMaturity(today()));
  const [errors, setErrors] = useState<MaturityErrors>({});
  useReturnFocus(open);

  const set = (key: MaturityField, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const change = (next: boolean) => {
    if (create.isPending) return;
    if (next) {
      setValues(emptyMaturity(today()));
      setErrors({});
      create.reset();
    }
    onOpenChange(next);
  };

  async function submit() {
    create.reset();
    const result = toMaturityDto(values, today());
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    try {
      await create.mutateAsync({ harvestBatchId: batch.id, body: result.dto });
      toast({ title: "Análisis registrado", description: batch.harvestBatchCode, tone: "success" });
      onOpenChange(false);
    } catch (err) {
      setErrors(maturityFieldErrors(err));
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={change}
      dismissible={!create.isPending}
      size="lg"
      title="Registrar análisis de madurez"
      description={`${batch.harvestBatchCode}. Se añade al historial: el análisis más reciente es el vigente.`}
      footer={
        <>
          <ModalClose asChild>
            <Button variant="secondary" size="lg" disabled={create.isPending}>
              Cancelar
            </Button>
          </ModalClose>
          <Button size="lg" loading={create.isPending} onClick={submit}>
            Guardar análisis
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <LabReadingCard
            target={LAB_TARGETS.brix}
            required
            name="brixDegrees"
            value={values.brixDegrees}
            onChange={(v) => set("brixDegrees", v)}
            error={errors.brixDegrees}
          />
          <LabReadingCard
            target={LAB_TARGETS.ph}
            required
            name="ph"
            value={values.ph}
            onChange={(v) => set("ph", v)}
            error={errors.ph}
          />
          <LabReadingCard
            target={LAB_TARGETS.acidity}
            required
            name="acidityGl"
            value={values.acidityGl}
            onChange={(v) => set("acidityGl", v)}
            error={errors.acidityGl}
          />
        </div>
        <Field label="Fecha y hora de la medición" required error={errors.measuredAt} help="Hora UTC.">
          <Input
            size="lg"
            type="datetime-local"
            value={values.measuredAt}
            onChange={(e) => set("measuredAt", e.target.value)}
          />
        </Field>
        <Field label="Notas" error={errors.notes} help="Opcional.">
          <Textarea rows={2} value={values.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>
        <RuleViolationNotice error={create.error} fields={MATURITY_FIELDS} />
      </div>
    </Modal>
  );
}
