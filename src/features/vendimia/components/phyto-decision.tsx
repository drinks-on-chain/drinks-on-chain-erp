"use client";

import { useState } from "react";
import type { HarvestBatchResponse } from "@drinks-on-chain/mocks";
import { Alert, Button, Field, Modal, ModalClose, Textarea, toast } from "@drinks-on-chain/ui";
import { UploadField } from "@/features/origen/components/upload-field";
import { errorMessage } from "@/lib/api/errors";
import { useUpdatePhytoStatus } from "@/lib/erp/hooks";
import { outOfRangeCount } from "../lab-targets";
import { availableDecisions, PHYTO_DECISIONS, type PhytoDecision } from "../phyto";

/**
 * 3.2 Dictamen: botones masivos (rechazar / cuarentena / aprobar) y confirmación explícita
 * en un modal con informe de inspección opcional (uploads?folder=inspections) y notas.
 */
export function PhytoDecisionPanel({ batch }: { batch: HarvestBatchResponse }) {
  const update = useUpdatePhytoStatus();
  const [decision, setDecision] = useState<PhytoDecision | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decisions = availableDecisions(batch.phytosanitaryStatus);
  const outOfRange = outOfRangeCount(batch);
  const config = decision ? PHYTO_DECISIONS[decision] : null;

  function open(d: PhytoDecision) {
    setDecision(d);
    setPdfUrl(batch.phytoInspectionPdfUrl ?? null);
    setNotes(batch.notes ?? "");
    setError(null);
  }

  async function confirm() {
    if (!decision || !config) return;
    setError(null);
    try {
      await update.mutateAsync({
        id: batch.id,
        body: { phytosanitaryStatus: decision, phytoInspectionPdfUrl: pdfUrl, notes: notes.trim() || null },
      });
      toast({
        title: config.done,
        description: batch.harvestBatchCode,
        tone: decision === "REJECTED" ? "danger" : "success",
      });
      setDecision(null);
    } catch (e) {
      setError(errorMessage(e));
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
        onOpenChange={(o) => !o && !update.isPending && setDecision(null)}
        dismissible={!update.isPending}
        title={config ? `${config.title} ${batch.harvestBatchCode}` : ""}
        description={
          decision === "QUARANTINE"
            ? "El lote queda retenido hasta un nuevo dictamen."
            : "Esta decisión es definitiva: no se puede deshacer desde el ERP."
        }
        footer={
          <>
            <ModalClose asChild>
              <Button variant="secondary" size="lg" disabled={update.isPending}>
                Cancelar
              </Button>
            </ModalClose>
            {config && (
              <Button
                variant={config.variant === "secondary" ? "primary" : config.variant}
                size="lg"
                loading={update.isPending}
                disabled={uploading}
                onClick={confirm}
              >
                {config.confirm}
              </Button>
            )}
          </>
        }
      >
        <div className="grid gap-4">
          {decision === "APPROVED" && outOfRange > 0 && (
            <Alert tone="warning" title="Lecturas fuera de objetivo">
              {outOfRange === 1 ? "Una lectura está" : `${outOfRange} lecturas están`} fuera del rango objetivo.
              Confirma que la inspección lo acepta.
            </Alert>
          )}
          {decision === "APPROVED" && (
            <p className="m-0 text-sm text-fg-muted">
              Al aprobarlo, el lote queda disponible para llenar un tanque de fermentación.
            </p>
          )}
          <UploadField
            label="Informe de inspección"
            folder="inspections"
            value={pdfUrl}
            onChange={setPdfUrl}
            onBusyChange={setUploading}
            help="Opcional. PDF o imagen, hasta 15 MB."
          />
          <Field label="Notas" help="Opcional. Se guardan en el lote.">
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          {error && (
            <Alert tone="danger" title="No se pudo guardar el dictamen">
              {error}
            </Alert>
          )}
        </div>
      </Modal>
    </>
  );
}
