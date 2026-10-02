"use client";

import { useState } from "react";
import type { HarvestBatchDetail } from "@drinks-on-chain/mocks";
import { Alert, Button, Field, Modal, ModalClose, Textarea, toast } from "@drinks-on-chain/ui";
import { RuleViolationNotice } from "@/components/rule-violation-notice";
import { UploadField } from "@/features/origen/components/upload-field";
import { useCreatePhytoDecision } from "@/lib/erp/hooks";
import { useReturnFocus } from "@/lib/use-return-focus";
import { outOfRangeCount } from "../lab-targets";
import { availableDecisions, PHYTO_DECISIONS, requiresReason, type PhytoDecision } from "../phyto";

/**
 * Dictamen fitosanitario (contrato de la Ola 2 §3.4): botones masivos (rechazar / cuarentena /
 * aprobar) y confirmación explícita en un modal, con informe de inspección opcional y motivo
 * (obligatorio al rechazar o poner en cuarentena). Cada dictamen se añade al historial con su
 * autor; el servidor decide si aún se puede dictaminar.
 */
export function PhytoDecisionPanel({ batch }: { batch: HarvestBatchDetail }) {
  const decide = useCreatePhytoDecision();
  const [decision, setDecision] = useState<PhytoDecision | null>(null);
  const [reportKey, setReportKey] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [notesError, setNotesError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  useReturnFocus(decision !== null);

  const decisions = availableDecisions(batch.phytosanitaryStatus);
  const outOfRange = outOfRangeCount(batch);
  const config = decision ? PHYTO_DECISIONS[decision] : null;
  const needsReason = decision !== null && requiresReason(decision);

  function open(d: PhytoDecision) {
    setDecision(d);
    setReportKey(null);
    setNotes("");
    setNotesError(null);
    decide.reset();
  }

  async function confirm() {
    if (!decision || !config) return;
    decide.reset();
    const reason = notes.trim();
    if (needsReason && !reason) {
      setNotesError("Indica el motivo: queda en el historial del dictamen.");
      return;
    }
    try {
      await decide.mutateAsync({
        harvestBatchId: batch.id,
        body: { decision, inspectionReportKey: reportKey, notes: reason || null },
      });
      toast({
        title: config.done,
        description: batch.harvestBatchCode,
        tone: decision === "REJECTED" ? "danger" : "success",
      });
      setDecision(null);
    } catch {
      // El aviso del modal explica el rechazo del servidor.
    }
  }

  return (
    <>
      <div className={decisions.length === 3 ? "grid gap-4 md:grid-cols-3" : "grid gap-4 md:grid-cols-2"}>
        {decisions.map((d) => (
          <Button key={d} size="xl" variant={PHYTO_DECISIONS[d].variant} onClick={() => open(d)}>
            {PHYTO_DECISIONS[d].action}
          </Button>
        ))}
      </div>

      <Modal
        open={decision !== null}
        onOpenChange={(o) => !o && !decide.isPending && setDecision(null)}
        dismissible={!decide.isPending}
        title={config ? `${config.title} ${batch.harvestBatchCode}` : ""}
        description={
          decision === "QUARANTINE"
            ? "La uva queda retenida hasta un nuevo dictamen."
            : "Esta decisión es definitiva: queda en el historial con tu nombre y no se sustituye."
        }
        footer={
          <>
            <ModalClose asChild>
              <Button variant="secondary" size="lg" disabled={decide.isPending}>
                Cancelar
              </Button>
            </ModalClose>
            {config && (
              <Button
                variant={config.variant === "secondary" ? "primary" : config.variant}
                size="lg"
                loading={decide.isPending}
                disabled={uploading}
                onClick={confirm}
              >
                {config.confirm}
              </Button>
            )}
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4">
          {decision === "APPROVED" && outOfRange > 0 && (
            <Alert tone="warning" title="Lecturas fuera de objetivo">
              {outOfRange === 1 ? "Una lectura está" : `${outOfRange} lecturas están`} fuera del rango objetivo.
              Confirma que la inspección lo acepta.
            </Alert>
          )}
          {decision === "APPROVED" && (
            <p className="m-0 text-sm text-fg-muted">
              Al aprobarla, la uva queda disponible para llenar un tanque de fermentación.
            </p>
          )}
          <UploadField
            label="Informe de inspección"
            folder="inspections"
            value={reportKey}
            onChange={setReportKey}
            onBusyChange={setUploading}
            help="Opcional. PDF o imagen, hasta 15 MB."
          />
          <Field
            label={needsReason ? "Motivo" : "Notas"}
            required={needsReason}
            error={notesError ?? undefined}
            help={needsReason ? "Obligatorio. Queda en el historial del dictamen." : "Opcional. Quedan en el dictamen."}
          >
            <Textarea
              rows={3}
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                setNotesError(null);
              }}
            />
          </Field>
          <RuleViolationNotice error={decide.error} title="No se pudo guardar el dictamen" />
        </div>
      </Modal>
    </>
  );
}
