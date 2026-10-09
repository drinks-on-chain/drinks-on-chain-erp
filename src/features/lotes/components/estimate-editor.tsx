"use client";

import { useState, type FormEvent } from "react";
import { Pencil } from "lucide-react";
import type { Lot } from "@drinks-on-chain/mocks";
import { Button, Field, Input, Modal, ModalClose, Textarea, toast } from "@drinks-on-chain/ui";
import { RuleViolationNotice } from "@/components/rule-violation-notice";
import { fieldErrorsFrom } from "@/lib/api/field-errors";
import { useUpdateLot } from "@/lib/erp/hooks";
import { fmtNumber } from "@/lib/format";
import { estimateFormErrors, type EstimateErrors } from "../lot-model";

const FIELDS = ["estimatedBottles", "reason"] as const;

/**
 * Cambia la estimación de botellas del lote (`PATCH /v1/lots/{id}`, con motivo: queda en su
 * historial). Es la base de la cuota de tokenización hasta el embotellado: el servidor no deja
 * bajarla de los NFT ya emitidos (`TOK_ESTIMATE_BELOW_MINTED`) y el aviso lo explica.
 */
export function EstimateEditor({ lot }: { lot: Pick<Lot, "id" | "name" | "estimatedBottles" | "tokenization"> }) {
  const update = useUpdateLot();
  const [open, setOpen] = useState(false);
  const [bottles, setBottles] = useState("");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<EstimateErrors>({});
  const minted = lot.tokenization.minted;

  const onOpenChange = (next: boolean) => {
    if (next) {
      setBottles(lot.estimatedBottles != null ? fmtNumber(lot.estimatedBottles) : "");
      setReason("");
      setErrors({});
      update.reset();
    }
    setOpen(next);
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    update.reset();
    const result = estimateFormErrors(bottles, reason);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    try {
      await update.mutateAsync({ id: lot.id, body: result.body });
      toast({
        title: "Estimación actualizada",
        description: `${lot.name} · ${fmtNumber(result.body.estimatedBottles)} botellas`,
        tone: "success",
      });
      setOpen(false);
    } catch (err) {
      setErrors(fieldErrorsFrom(err, FIELDS).fieldErrors);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title="Editar la estimación de botellas"
      description={`Cuántas botellas espera la bodega de ${lot.name}. Hasta el embotellado es el límite de la cuota de tokenización.`}
      trigger={
        <Button size="sm" variant="tertiary" iconStart={<Pencil aria-hidden size={14} />}>
          Editar estimación
        </Button>
      }
    >
      <form
        noValidate
        onSubmit={onSubmit}
        className="grid grid-cols-1 gap-4"
        aria-label="Editar la estimación de botellas"
      >
        <Field
          label="Botellas estimadas"
          required
          error={errors.estimatedBottles}
          help={
            minted > 0
              ? `Ya hay ${fmtNumber(minted)} NFT emitidos de este lote: la estimación no puede ser menor.`
              : "De 1 a 100.000 botellas."
          }
        >
          <Input
            numeric
            inputMode="numeric"
            suffix="botellas"
            value={bottles}
            onChange={(e) => setBottles(e.target.value)}
          />
        </Field>
        <Field label="Motivo del cambio" required error={errors.reason} help="Queda en la línea de tiempo del lote.">
          <Textarea rows={2} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <RuleViolationNotice error={update.error} fields={FIELDS} />
        <div className="flex flex-wrap justify-end gap-3">
          <ModalClose asChild>
            <Button type="button" variant="secondary">
              Cancelar
            </Button>
          </ModalClose>
          <Button type="submit" loading={update.isPending}>
            Guardar estimación
          </Button>
        </div>
      </form>
    </Modal>
  );
}
