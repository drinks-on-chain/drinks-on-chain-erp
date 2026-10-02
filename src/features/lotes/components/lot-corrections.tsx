"use client";

import { useMemo, useState } from "react";
import { PenLine } from "lucide-react";
import type { Correction, Lot, LotGraphNode } from "@drinks-on-chain/mocks";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  ModalClose,
  RadioGroup,
  Select,
  Skeleton,
  Textarea,
  toast,
} from "@drinks-on-chain/ui";
import { RuleViolationNotice } from "@/components/rule-violation-notice";
import { errorMessage } from "@/lib/api/errors";
import { useMe } from "@/lib/auth/hooks";
import { useCorrections, useCreateCorrection, useCreateTerroirCorrection, useLotGraph } from "@/lib/erp/hooks";
import { canCorrect, type CorrectionTarget } from "@/lib/erp/permissions";
import { fmtDateTime } from "@/lib/format";
import { useReturnFocus } from "@/lib/use-return-focus";
import {
  NODE_TARGET,
  REASON_MAX,
  REASON_MIN,
  TARGET_LABEL,
  changeText,
  correctableFields,
  correctionErrors,
  emptyCorrection,
  isVoidable,
  toCorrectionDto,
  type CorrectionErrors,
  type CorrectionValues,
} from "../correction-model";
import { actorText } from "../lot-timeline";

type Props = { lot: Pick<Lot, "id" | "name" | "reference" | "dossierStatus"> };

type Record_ = { id: string; type: CorrectionTarget; label: string };

const KINDS = [
  { value: "AMEND", label: "Corregir valores", description: "Se guarda el valor anterior junto al nuevo." },
  { value: "VOID", label: "Anular el registro", description: "Deja de contar para el lote; no se borra." },
];

/**
 * Correcciones del lote (contrato de la Ola 2 §9): lista de lo corregido (qué, de qué valor a cuál,
 * por qué y quién) y el diálogo para registrar una nueva. Ningún registro se edita ni se borra; el
 * servidor vuelve a validar las reglas del lote y, si la corrección las incumple, lo explica.
 */
export function LotCorrections({ lot }: Props) {
  const me = useMe();
  const corrections = useCorrections(lot.id);
  const graph = useLotGraph(lot.id);
  const [open, setOpen] = useState(false);

  // Registros del lote que esta persona puede corregir (S-17: quien puede crearlos).
  const records = useMemo<Record_[]>(
    () =>
      (graph.data?.nodes ?? [])
        .map((n: LotGraphNode) => ({ id: n.id, type: NODE_TARGET[n.type], label: n.label }))
        .filter((r) => canCorrect(me.data, r.type) && (isVoidable(r.type) || correctableFields(r.type).length > 0)),
    [graph.data, me.data],
  );
  const labels = useMemo(() => new Map((graph.data?.nodes ?? []).map((n) => [n.id, n.label] as const)), [graph.data]);
  const add =
    records.length > 0 ? (
      <Button variant="secondary" iconStart={<PenLine aria-hidden size={16} />} onClick={() => setOpen(true)}>
        Registrar corrección
      </Button>
    ) : undefined;

  return (
    <div className="grid grid-cols-1 gap-4">
      {lot.dossierStatus === "CLOSED" && (
        <Alert tone="info" title="El expediente está cerrado">
          Su huella ya está fijada: el servidor no admite más correcciones en este lote.
        </Alert>
      )}
      <Card className="grid grid-cols-1 gap-4">
        <CardHeader
          title="Correcciones"
          description="Un registro no se edita ni se borra: se corrige con otro registro que guarda el valor anterior, el motivo y quién lo hizo."
          action={add}
        />
        {corrections.isError ? (
          <ErrorState
            bare
            description={errorMessage(corrections.error)}
            onRetry={() => corrections.refetch()}
            retrying={corrections.isFetching}
          />
        ) : !corrections.data ? (
          <Skeleton shape="block" className="h-32" />
        ) : corrections.data.items.length === 0 ? (
          <EmptyState
            bare
            title="Sin correcciones"
            description="Los registros de este lote están como se escribieron."
          />
        ) : (
          <ul aria-label="Correcciones del lote" className="m-0 grid list-none gap-0 p-0">
            {corrections.data.items.map((c) => (
              <CorrectionItem key={c.id} correction={c} label={labels.get(c.target.id)} />
            ))}
          </ul>
        )}
      </Card>
      {records.length > 0 && <CorrectionDialog lot={lot} records={records} open={open} onOpenChange={setOpen} />}
    </div>
  );
}

function CorrectionItem({ correction: c, label }: { correction: Correction; label: string | undefined }) {
  return (
    <li className="grid gap-1 border-b border-border py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">
          {TARGET_LABEL[c.target.type]}
          {label ? ` · ${label}` : ""}
        </span>
        <Badge tone={c.kind === "VOID" ? "warning" : "info"}>{c.kind === "VOID" ? "Anulado" : "Corregido"}</Badge>
      </div>
      {c.kind === "AMEND" && (
        <ul className="m-0 grid list-none gap-0.5 p-0 text-sm tabular-nums">
          {c.changes.map((change) => (
            <li key={change.field}>{changeText(change)}</li>
          ))}
        </ul>
      )}
      <p className="m-0 text-sm">Motivo: {c.reason}</p>
      <p className="m-0 text-sm text-fg-muted">
        {fmtDateTime(c.createdAt)} · {actorText(c.createdBy)}
      </p>
    </li>
  );
}

function CorrectionDialog({
  lot,
  records,
  open,
  onOpenChange,
}: Props & { records: Record_[]; open: boolean; onOpenChange: (open: boolean) => void }) {
  const create = useCreateCorrection();
  const createTerroir = useCreateTerroirCorrection();
  const [recordId, setRecordId] = useState("");
  const [values, setValues] = useState<CorrectionValues>(emptyCorrection);
  const [errors, setErrors] = useState<CorrectionErrors>({ fields: {} });
  useReturnFocus(open);

  const record = records.find((r) => r.id === recordId);
  const fields = record ? correctableFields(record.type) : [];
  const voidable = record ? isVoidable(record.type) : false;
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
    const result = toCorrectionDto({ type: record.type, id: record.id }, values);
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
      } else {
        await create.mutateAsync({ lotId: lot.id, body: result.dto });
      }
      toast({
        title: values.kind === "VOID" ? "Registro anulado" : "Corrección registrada",
        description: `${TARGET_LABEL[record.type]} · ${record.label}`,
        tone: "success",
      });
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
      title="Registrar corrección"
      description={`${lot.name} · ${lot.reference}. El registro original se conserva; el servidor vuelve a comprobar las reglas del lote.`}
      footer={
        <>
          <ModalClose asChild>
            <Button variant="secondary" size="lg" disabled={busy}>
              Cancelar
            </Button>
          </ModalClose>
          <Button size="lg" loading={busy} disabled={!record} onClick={submit}>
            {values.kind === "VOID" ? "Anular registro" : "Registrar corrección"}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-5">
        <Field label="Registro que se corrige" required>
          <Select
            size="lg"
            placeholder="Elige el registro"
            value={recordId || undefined}
            onValueChange={pick}
            options={records.map((r) => ({ value: r.id, label: `${TARGET_LABEL[r.type]} · ${r.label}` }))}
          />
        </Field>

        {record && voidable && (
          <Field label="Qué se hace">
            <RadioGroup
              variant="card"
              value={values.kind}
              onValueChange={(kind) => setValues((v) => ({ ...v, kind: kind as CorrectionValues["kind"] }))}
              options={fields.length > 0 ? KINDS : KINDS.filter((k) => k.value === "VOID")}
            />
          </Field>
        )}

        {record && values.kind === "AMEND" && (
          <fieldset className="m-0 grid gap-3 border-0 p-0">
            <legend className="mb-2 p-0 font-ui text-sm font-semibold">Valores nuevos</legend>
            <p className="m-0 text-sm text-fg-muted">
              Escribe solo lo que cambia; lo que quede vacío no se toca. Estos son los únicos campos corregibles de este
              registro.
            </p>
            <div className="grid items-start gap-4 sm:grid-cols-2">
              {fields.map((f) => (
                <Field key={f.key} label={f.label} error={errors.fields[f.key]}>
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
