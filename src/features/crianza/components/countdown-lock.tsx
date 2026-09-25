import type { ReactNode } from "react";
import Link from "next/link";
import { Lock, LockOpen } from "lucide-react";
import { Button, Progress, cn } from "@drinks-on-chain/ui";
import { fmtDate, fmtDaysLeft, fmtNumber } from "@/lib/format";

export type CountdownLockProps = {
  /** Días que faltan para liberar (0 o menos = liberado). */
  daysRemaining: number;
  /** Avance del candado, 0–100. */
  progress: number;
  /** Titular del candado ("Lote inmovilizado por normativa"). */
  title: ReactNode;
  /** Motivo ("Mínimo 180 días de reposo para Singani D.O."). */
  reason: ReactNode;
  /** Fecha ISO de liberación. */
  releaseDate: string | null;
  /** Fecha ISO de inicio del candado y su etiqueta ("inicio del reposo"). */
  startDate?: string | null;
  startLabel?: string;
  /** Acción que el candado bloquea (p. ej. "Pasar a embotellado"). */
  action?: { label: string; href: string };
  /** Si el candado ya no aplica (embotellado, descartado), sustituye al botón. */
  closedNote?: ReactNode;
  /** Oculta la acción (rol sin permiso). */
  hideAction?: boolean;
  className?: string;
};

/**
 * Candado de tiempo (05 §3.3, 01-erp.html §07): días restantes en ámbar, barra de avance,
 * motivo y fecha de liberación; la acción queda deshabilitada hasta que el contador llega a cero.
 */
export function CountdownLock({
  daysRemaining,
  progress,
  title,
  reason,
  releaseDate,
  startDate,
  startLabel = "inicio",
  action,
  closedNote,
  hideAction,
  className,
}: CountdownLockProps) {
  const released = daysRemaining <= 0;
  const days = Math.max(0, daysRemaining);
  return (
    <section
      aria-label="Candado de tiempo"
      className={cn("grid gap-5 rounded-lg border border-border bg-bg-sunken p-5 md:p-6", className)}
    >
      <div
        className={cn(
          "flex flex-wrap items-center gap-4 rounded-md border p-4",
          released ? "border-success bg-success-soft" : "border-warning bg-warning-soft",
        )}
      >
        {released ? (
          <LockOpen aria-hidden size={40} strokeWidth={1.5} className="text-success" />
        ) : (
          <Lock aria-hidden size={40} strokeWidth={1.5} className="text-warning" />
        )}
        <div
          className={cn(
            "font-display text-5xl leading-none font-medium tabular-nums",
            released ? "text-success" : "text-warning",
          )}
          aria-label={fmtDaysLeft(days)}
          data-testid="countdown-days"
        >
          {fmtNumber(days)}
          <span className="ml-1 font-ui text-lg">{days === 1 ? "día" : "días"}</span>
        </div>
        <div className="min-w-0 flex-1 text-sm text-fg-muted">
          <strong className="block font-semibold text-fg">{released ? "Candado liberado" : title}</strong>
          {reason}
          {releaseDate && (
            <span className="block">
              {released ? "Liberado el " : "Se libera el "}
              {fmtDate(releaseDate)}.
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2">
        <Progress
          value={progress}
          tone={released ? "success" : "warning"}
          label="Avance del candado"
          valueText={released ? "Liberado" : fmtDaysLeft(days)}
        />
        <div className="flex justify-between gap-4 text-xs text-fg-subtle">
          <span>{startDate ? `${fmtDate(startDate)} · ${startLabel}` : ""}</span>
          <span>{releaseDate ? `${fmtDate(releaseDate)} · fin` : ""}</span>
        </div>
      </div>

      {closedNote ? (
        <p className="m-0 text-center text-sm text-fg-muted">{closedNote}</p>
      ) : action && !hideAction ? (
        <div className="grid grid-cols-1 gap-2">
          {released ? (
            <Button asChild size="lg" block>
              <Link href={action.href}>{action.label}</Link>
            </Button>
          ) : (
            <Button size="lg" block disabled>
              {action.label}
            </Button>
          )}
          {!released && (
            <p className="m-0 text-center text-xs text-fg-subtle">
              El botón se habilita cuando el contador llega a cero.
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
