import { ArrowRight, TriangleAlert } from "lucide-react";
import type { BottlingBalance, LotBalance } from "@drinks-on-chain/mocks";
import { Progress, cn } from "@drinks-on-chain/ui";
import { balanceSteps, bottlingMeters, projectionText } from "../balance-model";

// Pendiente de mover a @drinks-on-chain/ui.

/**
 * Medidores del balance del embotellado: una sola magnitud frente a su límite en cada barra
 * (litros embotellados de los disponibles, merma de la tolerada, alcohol puro del corazón). Las
 * cifras van siempre escritas; el color solo acompaña, y el ámbar aparece cuando el servidor dio
 * la regla por incumplida (con su icono y su texto).
 */
export function BottlingBalanceMeters({
  balance,
  violated = [],
  className,
}: {
  balance: BottlingBalance;
  /** Códigos `TRC_…` de la vista previa: resaltan el medidor de la regla incumplida. */
  violated?: readonly string[];
  className?: string;
}) {
  return (
    <ul aria-label="Balance del embotellado" className={cn("m-0 grid list-none gap-4 p-0", className)}>
      {bottlingMeters(balance, violated).map((m) => (
        <li key={m.key} className="grid gap-1.5" data-meter={m.key} data-over={m.over || undefined}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
            <span className="inline-flex items-center gap-1.5 font-medium">
              {m.over && <TriangleAlert aria-hidden size={14} className="text-warning" />}
              {m.label}
              {m.over && <span className="text-warning-text">· fuera de lo admitido</span>}
            </span>
            <span className="tabular-nums">{m.valueText}</span>
          </div>
          <Progress
            value={Math.min(m.value, m.max)}
            max={m.max > 0 ? m.max : 1}
            tone={m.over ? "warning" : "accent"}
            label={m.label}
            valueText={m.valueText}
            title={m.valueText}
          />
          {m.note && <p className="m-0 text-xs text-fg-muted">{m.note}</p>}
        </li>
      ))}
    </ul>
  );
}

/**
 * LotBalanceChart (contrato de la Ola 2 §11.3): conciliación kilos → litros → botellas del lote,
 * con la merma de cada etapa. Los pasos tienen unidades distintas, así que no comparten eje: cada
 * uno es una cifra con su detalle; el balance del embotellado sí se compara contra sus límites,
 * en medidores. Todo lo calcula el servidor (`GET /v1/lots/{id}/balance` y la vista previa).
 */
export function LotBalanceChart({
  balance,
  preview,
  violated,
  className,
}: {
  balance: LotBalance;
  /** Balance de la vista previa del embotellado (aún sin registrar): sustituye al guardado. */
  preview?: BottlingBalance | null;
  violated?: readonly string[];
  className?: string;
}) {
  const steps = balanceSteps(balance);
  const bottling = preview ?? balance.bottling;
  const projection = projectionText(balance.projection);

  return (
    <div className={cn("grid gap-5", className)}>
      <ol aria-label="Conciliación del lote" className="m-0 flex list-none flex-wrap items-stretch gap-x-2 gap-y-3 p-0">
        {steps.map((step, i) => (
          <li key={step.key} className="flex min-w-36 flex-1 items-stretch gap-2">
            {i > 0 && <ArrowRight aria-hidden size={16} className="mt-7 shrink-0 text-fg-subtle" />}
            <div
              className={cn(
                "grid flex-1 content-start gap-1 rounded-md border p-3",
                step.value === null ? "border-dashed border-border" : "border-border bg-bg-raised",
              )}
            >
              <span className="text-xs text-fg-muted">{step.label}</span>
              <span className={cn("text-xl font-medium tabular-nums", step.value === null && "text-fg-muted")}>
                {step.value ?? "No registrado"}
              </span>
              {step.detail && <span className="text-xs text-fg-muted">{step.detail}</span>}
              {step.loss && <span className="text-xs text-fg-muted">{step.loss}</span>}
            </div>
          </li>
        ))}
      </ol>

      {projection && (
        <p className="m-0 text-sm text-fg-muted">
          Proyección del servidor: <span className="font-medium text-fg">{projection}</span>.
        </p>
      )}

      {bottling && (
        <div className="grid gap-3">
          <h3 className="m-0 font-ui text-sm font-semibold">
            {preview ? "Balance del embotellado (vista previa)" : "Balance del embotellado"}
          </h3>
          <BottlingBalanceMeters balance={bottling} violated={violated} />
        </div>
      )}
    </div>
  );
}
