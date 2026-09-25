import { cn } from "@drinks-on-chain/ui";
import { fmtNumber } from "@/lib/format";

export type SparkPoint = { at: string; value: number };

const W = 240;
const H = 56;
const PAD = 4;

/**
 * Tendencia mínima en SVG (sin librería de gráficos): línea, último punto y, opcionalmente,
 * un umbral discontinuo (p. ej. 26 °C). Los puntos llegan en cualquier orden.
 */
export function TrendSparkline({
  label,
  unit,
  points,
  digits = 1,
  threshold,
  alert = false,
  className,
}: {
  label: string;
  unit: string;
  points: readonly SparkPoint[];
  digits?: number;
  threshold?: number;
  /** Último valor en ámbar (fuera de rango). */
  alert?: boolean;
  className?: string;
}) {
  const u = unit ? ` ${unit}` : "";
  const data = [...points].sort((a, b) => a.at.localeCompare(b.at));
  const last = data.at(-1);
  const values = data.map((p) => p.value).concat(threshold !== undefined ? [threshold] : []);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => PAD + (data.length <= 1 ? (W - 2 * PAD) / 2 : (i / (data.length - 1)) * (W - 2 * PAD));
  const y = (v: number) => H - PAD - ((v - min) / span) * (H - 2 * PAD);
  const path = data.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const first = data[0];
  const summary = last
    ? `${label}: última ${fmtNumber(last.value, digits)}${u}${first && first !== last ? `, desde ${fmtNumber(first.value, digits)}${u}` : ""}`
    : `${label}: sin lecturas`;

  return (
    <figure className={cn("m-0 grid gap-1", className)}>
      <figcaption className="flex items-baseline justify-between gap-2 text-sm text-fg-muted">
        <span>{label}</span>
        <span className={cn("text-lg font-medium tabular-nums", alert ? "text-warning" : "text-fg")}>
          {last ? `${fmtNumber(last.value, digits)}${u}` : "—"}
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-14 w-full" role="img" aria-label={summary} preserveAspectRatio="none">
        {threshold !== undefined && data.length > 0 && (
          <line
            x1={PAD}
            x2={W - PAD}
            y1={y(threshold)}
            y2={y(threshold)}
            className="stroke-warning"
            strokeDasharray="4 4"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        )}
        {data.length > 1 && (
          <path d={path} fill="none" className="stroke-accent" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        )}
        {last && (
          <circle cx={x(data.length - 1)} cy={y(last.value)} r={3} className={alert ? "fill-warning" : "fill-accent"} />
        )}
      </svg>
    </figure>
  );
}
