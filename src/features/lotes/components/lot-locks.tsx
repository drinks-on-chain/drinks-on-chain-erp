import { Lock, LockOpen } from "lucide-react";
import type { LotLockInfo } from "@drinks-on-chain/mocks";
import { cn } from "@drinks-on-chain/ui";
import { LOCK_KIND } from "@/lib/erp/labels";
import { fmtDaysLeft, fmtNumber } from "@/lib/format";
import { lockRuleText, lockStatusText } from "../lot-model";

/**
 * Candados del lote tal como los evalúa el servidor con la instantánea de reglas y su reloj
 * (contrato de la Ola 2 §5.3): días que faltan en ámbar, motivo del bloqueo y fecha de liberación.
 */
export function LotLocks({ locks, className }: { locks: LotLockInfo[]; className?: string }) {
  if (locks.length === 0) return null;
  return (
    <ul aria-label="Candados del lote" className={cn("m-0 grid list-none gap-3 p-0", className)}>
      {locks.map((lock) => (
        <li
          key={`${lock.kind}-${lock.sourceId}`}
          className={cn(
            "flex flex-wrap items-center gap-4 rounded-md border p-4",
            lock.released ? "border-success bg-success-soft" : "border-warning bg-warning-soft",
          )}
        >
          {lock.released ? (
            <LockOpen aria-hidden size={32} strokeWidth={1.5} className="text-success" />
          ) : (
            <Lock aria-hidden size={32} strokeWidth={1.5} className="text-warning" />
          )}
          <p
            className={cn(
              "m-0 font-display text-4xl leading-none font-medium tabular-nums",
              lock.released ? "text-success-text" : "text-warning-text",
            )}
            aria-label={fmtDaysLeft(lock.daysRemaining)}
            data-testid="lock-days"
          >
            {fmtNumber(lock.daysRemaining)}
            <span className="ml-1 font-ui text-base">{lock.daysRemaining === 1 ? "día" : "días"}</span>
          </p>
          <div className="min-w-0 flex-1 text-sm text-fg-muted">
            <strong className="block font-semibold text-fg">
              {lock.released ? "Candado liberado" : LOCK_KIND[lock.kind]}
            </strong>
            <span className="block">{lockRuleText(lock)}</span>
            <span className="block">{lockStatusText(lock)}.</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
