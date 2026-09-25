import Link from "next/link";
import { Timeline } from "@drinks-on-chain/ui";
import { fmtDate } from "@/lib/format";
import type { LotStep } from "./lots";

/** LotTimeline (05 §3.3): la cadena del lote con fechas, estado y enlace a cada módulo. */
export function LotTimeline({ steps }: { steps: LotStep[] }) {
  return (
    <Timeline
      aria-label="Recorrido del lote"
      items={steps.map((s) => ({
        key: s.key,
        status: s.status,
        title: (
          <span>
            <span className="text-fg-muted">{s.stage} · </span>
            {s.href ? (
              <Link href={s.href} className="font-medium hover:underline">
                {s.title}
              </Link>
            ) : (
              <span className="text-fg-muted">{s.title}</span>
            )}
          </span>
        ),
        time: s.time ? fmtDate(s.time) : s.status === "pending" ? "Pendiente" : undefined,
        description: s.detail ?? undefined,
      }))}
    />
  );
}
