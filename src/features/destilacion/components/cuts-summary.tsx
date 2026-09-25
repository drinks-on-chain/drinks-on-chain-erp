import { cn } from "@drinks-on-chain/ui";
import { fmtLiters, fmtNumber } from "@/lib/format";
import { cutShares, type Cuts } from "../distillation-model";

/** Resumen de los cortes: tres cifras (corazón en oro) y la barra de proporciones. */
export function CutsSummary({ cuts, inputLiters }: { cuts: Cuts; inputLiters: number | null }) {
  const shares = cutShares(cuts);
  const items = [
    { key: "head", label: "Cabeza", liters: cuts.head, share: shares.head, bar: "bg-border-strong" },
    { key: "heart", label: "Corazón", liters: cuts.heart, share: shares.heart, bar: "bg-accent" },
    { key: "tail", label: "Cola", liters: cuts.tail, share: shares.tail, bar: "bg-fg-subtle" },
  ] as const;
  const yieldPct = cuts.heart !== null && inputLiters ? (cuts.heart / inputLiters) * 100 : null;

  return (
    <div className="grid gap-4">
      <dl className="m-0 grid grid-cols-3 gap-3">
        {items.map((i) => (
          <div
            key={i.key}
            className={cn(
              "grid gap-1 rounded-md border p-3",
              i.key === "heart" ? "border-accent bg-accent-soft" : "border-border bg-bg-raised",
            )}
          >
            <dt className="text-xs text-fg-muted">{i.label}</dt>
            <dd className={cn("m-0 text-2xl font-medium tabular-nums", i.key === "heart" && "text-accent-text")}>
              {i.liters !== null ? fmtLiters(i.liters) : "—"}
            </dd>
            <dd className="m-0 text-xs text-fg-subtle tabular-nums">{fmtNumber(i.share, 1)} % de los cortes</dd>
          </div>
        ))}
      </dl>
      <div
        className="flex h-3 overflow-hidden rounded-full bg-bg-deep"
        role="img"
        aria-label={`Cabeza ${fmtNumber(shares.head, 1)} %, corazón ${fmtNumber(shares.heart, 1)} %, cola ${fmtNumber(shares.tail, 1)} %`}
      >
        {items.map((i) => (
          <span key={i.key} className={i.bar} style={{ width: `${i.share}%` }} />
        ))}
      </div>
      {yieldPct !== null && (
        <p className="m-0 text-sm text-fg-muted">
          Rendimiento del corazón: {fmtNumber(yieldPct, 1)} % del vino base ({fmtLiters(inputLiters!)}).
        </p>
      )}
    </div>
  );
}
