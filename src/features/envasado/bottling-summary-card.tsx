import { Fragment } from "react";
import { Alert, Card, CardHeader, cn } from "@drinks-on-chain/ui";
import { fmtNumber } from "@/lib/format";
import { SHRINKAGE_WARN_PCT, type YieldSummary } from "./bottling-summary";

const fmtStep = (value: number | null, unit: "kg" | "L" | "ud") =>
  value === null ? null : `${fmtNumber(value)} ${unit === "ud" ? "botellas" : unit}`;

/** BottlingSummary (05 §3.3): conciliación kg → L → botellas con aviso de merma. */
export function BottlingSummary({ summary, className }: { summary: YieldSummary; className?: string }) {
  const { steps, shrinkagePct, warning, availableLiters, bottledLiters } = summary;
  return (
    <Card className={cn("grid gap-4", className)} aria-labelledby="bottling-summary-title">
      <CardHeader
        title={<span id="bottling-summary-title">Conciliación de rendimiento</span>}
        description="De la uva a la botella, con los datos registrados en cada etapa."
      />
      <ol className="grid gap-2" aria-label="Pasos de la conciliación">
        {steps.map((s, i) => {
          const value = fmtStep(s.value, s.unit);
          return (
            <Fragment key={s.key}>
              {i > 0 && (
                <li aria-hidden className="text-fg-subtle pl-3 text-xs leading-none">
                  ↓
                </li>
              )}
              <li className="flex items-baseline justify-between gap-3 rounded-sm bg-bg-sunken px-3 py-2">
                <span className="text-fg-muted text-sm">{s.label}</span>
                {value ? (
                  <span className="font-medium tabular-nums">{value}</span>
                ) : (
                  <span className="text-fg-subtle text-sm italic">sin dato</span>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
      {shrinkagePct === null ? (
        <p className="text-fg-muted text-sm">
          La merma se calcula al completar el grado, las botellas y el formato
          {availableLiters === null ? " (y cuando la cadena tenga el volumen disponible)" : ""}.
        </p>
      ) : warning === "merma-alta" ? (
        <Alert tone="warning" title={`Merma de envasado ${fmtNumber(shrinkagePct, 1)} %`}>
          Supera el {SHRINKAGE_WARN_PCT} % esperado: {fmtNumber(availableLiters ?? 0)} L disponibles y{" "}
          {fmtNumber(bottledLiters ?? 0)} L envasados. Revisa las botellas llenadas o el formato.
        </Alert>
      ) : warning === "excede-volumen" ? (
        <Alert tone="warning" title="Más volumen envasado que el disponible">
          Se declaran {fmtNumber(bottledLiters ?? 0)} L envasados y la cadena registra {fmtNumber(availableLiters ?? 0)}{" "}
          L. Revisa las cifras antes de cerrar la producción.
        </Alert>
      ) : (
        <Alert tone="info" title={`Merma de envasado ${fmtNumber(Math.max(0, shrinkagePct), 1)} %`}>
          {fmtNumber(bottledLiters ?? 0)} L envasados de {fmtNumber(availableLiters ?? 0)} L disponibles.
        </Alert>
      )}
    </Card>
  );
}
