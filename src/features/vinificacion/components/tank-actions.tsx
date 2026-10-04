"use client";

import { useState } from "react";
import { Flame, Wine } from "lucide-react";
import type { BifurcationDestination, FermentationTankResponse } from "@drinks-on-chain/mocks";
import { Button, ConfirmDialog, Field, Input, toast } from "@drinks-on-chain/ui";
import { RuleViolationNotice } from "@/components/rule-violation-notice";
import { errorMessage } from "@/lib/api/errors";
import { isRuleError } from "@/lib/api/rule-violations";
import { useCleanTank, useCompleteTank, useStartTank } from "@/lib/erp/hooks";
import { today } from "@/lib/erp/today";
import { fmtLiters, numberToInput } from "@/lib/format";
import { toDateInput } from "../form-utils";
import {
  COMPLETE_TANK_FIELDS,
  completeTankFieldErrors,
  toCompleteTankDto,
  type CompleteTankField,
  type CompleteTankValues,
} from "../tank-model";
import { DecisionModal, type DecisionOption } from "./decision-modal";

type Tank = Pick<FermentationTankResponse, "id" | "tankCode" | "status" | "volumeFilledLiters">;

/**
 * Explica el rechazo de una transición del tanque (409 `TRC_TANK_INVALID_TRANSITION`, lote
 * terminal…) en un aviso bajo los botones; lo demás, en un aviso emergente.
 */
function useTransitionError() {
  const [error, setError] = useState<unknown>(null);
  return {
    error,
    clear: () => setError(null),
    handle: (err: unknown, title: string) => {
      if (isRuleError(err)) setError(err);
      else toast({ title, description: errorMessage(err), tone: "danger" });
    },
  };
}

/** `FILLING → FERMENTING` (`POST …/start`): empieza la bitácora diaria. */
export function StartFermentationButton({ tank }: { tank: Tank }) {
  const start = useStartTank();
  const failure = useTransitionError();
  return (
    <div className="grid gap-3">
      <ConfirmDialog
        title={`¿Iniciar la fermentación de ${tank.tankCode}?`}
        description="El tanque pasa a fermentando y empieza su bitácora diaria."
        confirmLabel="Sí, iniciar"
        trigger={<Button onClick={failure.clear}>Iniciar fermentación</Button>}
        onConfirm={async () => {
          try {
            await start.mutateAsync({ id: tank.id });
            toast({ title: "Fermentación iniciada", description: tank.tankCode, tone: "success" });
          } catch (err) {
            failure.handle(err, "No se pudo iniciar la fermentación");
          }
        }}
      />
      <RuleViolationNotice error={failure.error} />
    </div>
  );
}

/** `TRANSFERRED → CLEANED` (`POST …/clean`): libera el código del tanque físico. */
export function CleanTankButton({ tank }: { tank: Tank }) {
  const clean = useCleanTank();
  const failure = useTransitionError();
  return (
    <div className="grid gap-3">
      <ConfirmDialog
        title={`¿Marcar ${tank.tankCode} como limpio?`}
        description="El tanque queda vacío y su código se puede volver a usar en otro llenado."
        confirmLabel="Sí, está limpio"
        trigger={
          <Button variant="secondary" onClick={failure.clear}>
            Marcar como limpio
          </Button>
        }
        onConfirm={async () => {
          try {
            await clean.mutateAsync({ id: tank.id });
            toast({ title: "Tanque limpio", description: `${tank.tankCode} queda libre.`, tone: "success" });
          } catch (err) {
            failure.handle(err, "No se pudo marcar el tanque como limpio");
          }
        }}
      />
      <RuleViolationNotice error={failure.error} />
    </div>
  );
}

const OPTIONS: DecisionOption<BifurcationDestination>[] = [
  {
    value: "WINE_AGING",
    title: "A crianza",
    subtitle: "Vino · barricas o botella",
    icon: <Wine size={28} strokeWidth={1.5} />,
  },
  {
    value: "SINGANI_DIST",
    title: "A destilación",
    subtitle: "Singani · alambique y reposo; el servidor comprueba la D.O. de toda la uva del lote",
    icon: <Flame size={28} strokeWidth={1.5} />,
  },
];

/**
 * `FERMENTING → COMPLETED` con la bifurcación (contrato de la Ola 2 §4.2–§4.3): fecha de fin,
 * volumen final y destino. El destino fija el tipo del lote y no cambia después; si el lote ya
 * tiene tipo, o la uva no es apta para singani, el servidor lo rechaza y aquí se explica.
 */
export function CompleteFermentationButton({
  tank,
  variant = "secondary",
}: {
  tank: Tank;
  variant?: "primary" | "secondary";
}) {
  const complete = useCompleteTank();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<CompleteTankValues>({ endDate: "", finalVolumeLiters: "" });
  const [errors, setErrors] = useState<Partial<Record<CompleteTankField, string>>>({});

  const openDialog = () => {
    complete.reset();
    setErrors({});
    setValues({ endDate: toDateInput(today()), finalVolumeLiters: numberToInput(tank.volumeFilledLiters) });
    setOpen(true);
  };
  const set = (key: CompleteTankField, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  async function confirm(destination: BifurcationDestination) {
    complete.reset();
    const result = toCompleteTankDto(values, destination, today());
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    try {
      const done = await complete.mutateAsync({ id: tank.id, body: result.dto });
      toast({
        title: "Fermentación completada",
        description:
          destination === "SINGANI_DIST"
            ? `${done.tankCode}: destino destilación (singani).`
            : `${done.tankCode}: destino crianza (vino).`,
        tone: "success",
      });
      setOpen(false);
    } catch (err) {
      setErrors(completeTankFieldErrors(err));
    }
  }

  return (
    <>
      <Button variant={variant} onClick={openDialog}>
        Completar fermentación
      </Button>
      <DecisionModal
        open={open}
        onOpenChange={setOpen}
        title={`Completar la fermentación de ${tank.tankCode}`}
        description="Registra el final de la fermentación y decide el destino. La ruta contraria queda bloqueada."
        options={OPTIONS}
        acknowledgement="Entiendo que el destino fija el tipo del lote y no se puede cambiar después."
        confirmLabel="Confirmar destino y completar"
        onConfirm={confirm}
        confirming={complete.isPending}
        error={<RuleViolationNotice error={complete.error} fields={COMPLETE_TANK_FIELDS} />}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Fin de la fermentación" required error={errors.endDate}>
            <Input type="date" value={values.endDate} onChange={(e) => set("endDate", e.target.value)} />
          </Field>
          <Field
            label="Volumen final"
            required
            error={errors.finalVolumeLiters}
            help={
              tank.volumeFilledLiters != null
                ? `Se llenó con ${fmtLiters(tank.volumeFilledLiters)}: la diferencia es la merma de fermentación.`
                : "Litros de vino base que quedan en el tanque."
            }
          >
            <Input
              numeric
              suffix="L"
              value={values.finalVolumeLiters}
              onChange={(e) => set("finalVolumeLiters", e.target.value)}
            />
          </Field>
        </div>
      </DecisionModal>
    </>
  );
}
