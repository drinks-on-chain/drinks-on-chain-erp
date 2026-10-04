"use client";

import { useState, type ReactNode } from "react";
import {
  Button,
  Field,
  Input,
  Modal,
  ModalClose,
  RadioGroup,
  Select,
  Textarea,
  toast,
  type ButtonProps,
} from "@drinks-on-chain/ui";
import { RuleViolationNotice } from "@/components/rule-violation-notice";
import { useMe } from "@/lib/auth/hooks";
import { useCreateCorrection, useCreateTerroirCorrection, useFreshLot } from "@/lib/erp/hooks";
import { canCorrect, type CorrectionTarget } from "@/lib/erp/permissions";
import { ruleTitle } from "@/lib/erp/rule-violations";
import { useReturnFocus } from "@/lib/use-return-focus";
import {
  REASON_MAX,
  REASON_MIN,
  TARGET_LABEL,
  correctableFields,
  correctionErrors,
  emptyCorrection,
  isVoidable,
  newCorrectionIssues,
  toCorrectionDto,
  type CorrectionErrors,
  type CorrectionValues,
} from "../correction-model";

/** Registro de la trazabilidad que se puede corregir: su tipo, su id y cómo se le llama en pantalla. */
export type CorrectableRecord = { id: string; type: CorrectionTarget; label: string };

const KINDS = [
  { value: "AMEND", label: "Corregir valores", description: "Se guarda el valor anterior junto al nuevo." },
  { value: "VOID", label: "Anular el registro", description: "Deja de contar para el lote; no se borra." },
];

type Props = {
  lotId: string;
  /** "Singani Gran Reserva 2026 · CVJ-L2026-005", para la descripción del diálogo. */
  lotLabel: string;
  /** Uno solo: el diálogo es de ese registro. Varios: se elige en un desplegable. */
  records: readonly CorrectableRecord[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Diálogo de corrección compensatoria (contrato de la Ola 2 §9): valores nuevos de los campos
 * corregibles, o anulación si el registro lo admite, siempre con motivo. Nada se edita ni se borra.
 * El servidor vuelve a validar las reglas del lote: si la corrección las incumple la rechaza (422)
 * o, si el lote ya está embotellado, la registra y abre una incidencia de cumplimiento.
 */
export function CorrectionDialog({ lotId, lotLabel, records, open, onOpenChange }: Props) {
  const create = useCreateCorrection();
  const createTerroir = useCreateTerroirCorrection();
  const freshLot = useFreshLot();
  const single = records.length === 1 ? records[0]! : null;
  const [recordId, setRecordId] = useState("");
  const [values, setValues] = useState<CorrectionValues>(emptyCorrection);
  const [errors, setErrors] = useState<CorrectionErrors>({ fields: {} });
  useReturnFocus(open);

  const record = single ?? records.find((r) => r.id === recordId);
  const fields = record ? correctableFields(record.type) : [];
  const voidable = record ? isVoidable(record.type) : false;
  // Un registro sin campos corregibles (un dictamen) solo se puede anular.
  const kind: CorrectionValues["kind"] = record && fields.length === 0 ? "VOID" : values.kind;
  const busy = create.isPending || createTerroir.isPending;
  const failure = create.error ?? createTerroir.error;

  const change = (next: boolean) => {
    if (busy) return;
    if (next) {
      setRecordId("");
      setValues(emptyCorrection());
      setErrors({ fields: {} });
      create.reset();
      createTerroir.reset();
    }
    onOpenChange(next);
  };

  const pick = (id: string) => {
    setRecordId(id);
    setValues((v) => ({ ...emptyCorrection(), reason: v.reason }));
    setErrors({ fields: {} });
  };

  async function submit() {
    create.reset();
    createTerroir.reset();
    if (!record) return;
    const result = toCorrectionDto({ type: record.type, id: record.id }, { ...values, kind });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({ fields: {} });
    try {
      // La parcela se corrige en su propia ruta: afecta a todos los lotes abiertos que la usan.
      if (record.type === "TERROIR") {
        await createTerroir.mutateAsync({
          terroirId: record.id,
          body: { changes: result.dto.changes ?? {}, reason: result.dto.reason },
        });
        toast({ title: "Corrección registrada", description: `Parcela · ${record.label}`, tone: "success" });
        onOpenChange(false);
        return;
      }
      const before = await freshLot(lotId).catch(() => null);
      await create.mutateAsync({ lotId, body: result.dto });
      const after = await freshLot(lotId).catch(() => null);
      const opened = before && after ? newCorrectionIssues(before.complianceIssues, after.complianceIssues) : [];
      if (opened.length > 0) {
        // Lote ya embotellado: la corrección queda registrada aunque incumpla una regla del
        // embotellado, y el servidor abre una incidencia (contrato §9, mocks rc.2).
        const first = opened[0]!;
        const detailCode = first.details.find((d) => d.code)?.code;
        const rule = ruleTitle(detailCode ?? first.code).toLowerCase();
        toast({
          title: "Corrección registrada con una incidencia",
          description: `El lote ya está embotellado: la corrección queda, pero incumple una regla del embotellado (${rule}). Se abrió una incidencia de cumplimiento en el lote.`,
          tone: "warning",
        });
      } else {
        toast({
          title: kind === "VOID" ? "Registro anulado" : "Corrección registrada",
          description: `${TARGET_LABEL[record.type]} · ${record.label}`,
          tone: "success",
        });
      }
      onOpenChange(false);
    } catch (err) {
      setErrors(correctionErrors(err));
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={change}
      dismissible={!busy}
      size="lg"
      title={single ? `Corregir ${TARGET_LABEL[single.type].toLowerCase()}` : "Registrar corrección"}
      description={`${single ? `${single.label} · ` : ""}${lotLabel}. El registro original se conserva; el servidor vuelve a comprobar las reglas del lote.`}
      footer={
        <>
          <ModalClose asChild>
            <Button variant="secondary" size="lg" disabled={busy}>
              Cancelar
            </Button>
          </ModalClose>
          <Button size="lg" loading={busy} disabled={!record} onClick={submit}>
            {kind === "VOID" ? "Anular registro" : "Registrar corrección"}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-5">
        {!single && (
          <Field label="Registro que se corrige" required>
            <Select
              size="lg"
              placeholder="Elige el registro"
              value={recordId || undefined}
              onValueChange={pick}
              options={records.map((r) => ({ value: r.id, label: `${TARGET_LABEL[r.type]} · ${r.label}` }))}
            />
          </Field>
        )}

        {record && voidable && fields.length > 0 && (
          <Field label="Qué se hace">
            <RadioGroup
              variant="card"
              value={kind}
              onValueChange={(next) => setValues((v) => ({ ...v, kind: next as CorrectionValues["kind"] }))}
              options={KINDS}
            />
          </Field>
        )}
        {record && fields.length === 0 && (
          <p className="m-0 text-sm text-fg-muted">
            Este registro no tiene campos corregibles: solo se puede anular. Anulado, deja de contar para el lote y
            queda marcado en su historial.
          </p>
        )}

        {record && kind === "AMEND" && (
          <fieldset className="m-0 grid gap-3 border-0 p-0">
            <legend className="mb-2 p-0 font-ui text-sm font-semibold">Valores nuevos</legend>
            <p className="m-0 text-sm text-fg-muted">
              Escribe solo lo que cambia; lo que quede vacío no se toca. Estos son los únicos campos corregibles de este
              registro.
            </p>
            <div className="grid items-start gap-4 sm:grid-cols-2">
              {fields.map((f) => (
                <Field key={f.key} label={f.label} error={errors.fields[f.key] || undefined}>
                  <Input
                    type={f.kind === "date" ? "date" : "text"}
                    numeric={f.kind === "number" || f.kind === "integer"}
                    inputMode={f.kind === "number" ? "decimal" : f.kind === "integer" ? "numeric" : undefined}
                    suffix={f.unit}
                    value={values.changes[f.key] ?? ""}
                    onChange={(e) => {
                      const value = e.target.value;
                      setValues((v) => ({ ...v, changes: { ...v.changes, [f.key]: value } }));
                      setErrors((x) => ({ ...x, changes: undefined, fields: { ...x.fields, [f.key]: "" } }));
                    }}
                  />
                </Field>
              ))}
            </div>
            {errors.changes && (
              <p role="alert" className="m-0 text-sm text-danger-text">
                {errors.changes}
              </p>
            )}
          </fieldset>
        )}

        {record && (
          <Field
            label="Motivo"
            required
            error={errors.reason}
            help={`Queda en la línea de tiempo y en la bitácora. De ${REASON_MIN} a ${REASON_MAX} caracteres.`}
          >
            <Textarea
              rows={3}
              maxLength={REASON_MAX}
              value={values.reason}
              onChange={(e) => {
                const reason = e.target.value;
                setValues((v) => ({ ...v, reason }));
                setErrors((x) => ({ ...x, reason: undefined }));
              }}
            />
          </Field>
        )}

        <RuleViolationNotice error={failure} fields={["reason", "changes", "kind"]} />
      </div>
    </Modal>
  );
}

/**
 * Botón «Corregir» (o «Anular») de un registro concreto: lo ve quien puede crear ese tipo de
 * registro (S-17), y solo si el registro pertenece a un lote y no está ya anulado.
 */
export function CorrectRecordButton({
  lotId,
  lotLabel,
  record,
  voided = false,
  size = "sm",
  variant = "tertiary",
  children,
}: {
  lotId: string | null | undefined;
  lotLabel: string;
  record: CorrectableRecord;
  voided?: boolean;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
  children?: ReactNode;
}) {
  const me = useMe();
  const [open, setOpen] = useState(false);
  if (!lotId || voided || !canCorrect(me.data, record.type)) return null;
  const onlyVoid = correctableFields(record.type).length === 0;
  if (onlyVoid && !isVoidable(record.type)) return null;
  return (
    <>
      <Button size={size} variant={variant} onClick={() => setOpen(true)}>
        {children ?? (onlyVoid ? "Anular" : "Corregir")}
        <span className="sr-only"> {record.label}</span>
      </Button>
      <CorrectionDialog lotId={lotId} lotLabel={lotLabel} records={[record]} open={open} onOpenChange={setOpen} />
    </>
  );
}
