import { cn } from "@drinks-on-chain/ui";
import { outerRing, ringToSvgPoints } from "../parcel-shape";

type Geometry = { type: string; coordinates: unknown[] } | null | undefined;

// Silueta por defecto (la de la maqueta) cuando la parcela no tiene polígono.
const FALLBACK = "30,28 70,28 70,72 30,72";

/** Mapa estilizado de la parcela: cuadrícula hundida y la silueta del polígono en oro. */
export function ParcelMap({ geometry, className }: { geometry: Geometry; className?: string }) {
  const ring = outerRing(geometry);
  const points = ring ? ringToSvgPoints(ring) : FALLBACK;
  return (
    <div
      aria-hidden
      className={cn("relative h-28 overflow-hidden rounded-sm bg-bg-sunken", className)}
      style={{
        backgroundImage:
          "repeating-linear-gradient(0deg, transparent 0 11px, var(--doc-border) 11px 12px), repeating-linear-gradient(90deg, transparent 0 11px, var(--doc-border) 11px 12px)",
      }}
    >
      <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" className="absolute inset-0 size-full">
        <polygon
          points={points}
          transform={ring ? undefined : "rotate(-8 50 50)"}
          fill="var(--doc-accent-soft)"
          stroke="var(--doc-accent)"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
