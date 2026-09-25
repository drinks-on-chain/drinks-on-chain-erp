import Link from "next/link";
import { Thermometer } from "lucide-react";
import { Badge, cn, focusRing } from "@drinks-on-chain/ui";
import { DESTINATION, TANK_STATUS } from "@/lib/erp/labels";
import { fmtLiters, fmtNumber } from "@/lib/format";
import type { TankCardModel } from "../tank-model";

/** Destino corto para la tarjeta ("Crianza", "Destilación"). */
const DESTINATION_SHORT: Record<string, string> = {
  WINE_AGING: "A crianza",
  SINGANI_DIST: "A destilación",
};

/**
 * Tanque en el mapa (05 §3.3, 01-erp.html §06): código, nivel de llenado, temperatura, día de
 * fermentación, destino y estado. Ámbar cuando la última lectura supera 26 °C.
 */
export function TankCard({ tank, className }: { tank: TankCardModel; className?: string }) {
  const status = TANK_STATUS[tank.status];
  const fermenting = tank.status === "FERMENTING";
  return (
    <Link
      href={`/vinificacion/${tank.id}`}
      className={cn(
        "group grid min-h-14 gap-2 rounded-md border bg-bg-raised p-3 transition-colors",
        focusRing,
        "hover:border-border-strong",
        tank.hot ? "border-warning bg-warning-soft" : "border-border",
        className,
      )}
      data-testid="tank-card"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium tracking-label text-fg-subtle uppercase">{tank.tankCode}</span>
        <span className="text-2xs text-fg-subtle tabular-nums">{fmtNumber(tank.fillPct)} %</span>
      </div>

      <div
        className="relative h-16 overflow-hidden rounded-sm border border-border-strong bg-bg"
        role="img"
        aria-label={`Llenado ${fmtNumber(tank.fillPct)} %`}
      >
        <span
          className="absolute inset-x-0 bottom-0 bg-accent-soft"
          style={{
            height: `${tank.fillPct}%`,
            backgroundImage: fermenting
              ? "repeating-linear-gradient(45deg, var(--doc-accent-soft) 0 6px, transparent 6px 12px)"
              : undefined,
          }}
        />
        {tank.volumeLiters !== null && tank.capacityLiters !== null && (
          <span className="absolute inset-x-0 bottom-1 text-center text-2xs text-fg-muted tabular-nums">
            {fmtNumber(tank.volumeLiters)} / {fmtLiters(tank.capacityLiters)}
          </span>
        )}
      </div>

      {fermenting && (
        <span
          className={cn(
            "flex items-center gap-1 text-lg leading-none font-medium tabular-nums",
            tank.hot ? "text-warning" : "text-fg",
          )}
        >
          <Thermometer aria-hidden size={16} strokeWidth={1.5} />
          {tank.temperature !== null ? `${fmtNumber(tank.temperature, 1)} °C` : "Sin lecturas"}
        </span>
      )}

      <div className="flex flex-wrap gap-1">
        {tank.hot ? (
          <Badge tone="warning">Temperatura alta</Badge>
        ) : (
          <Badge tone={status.tone}>
            {fermenting && tank.day !== null ? `Fermentando · día ${fmtNumber(tank.day)}` : status.label}
          </Badge>
        )}
      </div>
      {tank.hot && tank.day !== null && (
        <span className="text-xs text-fg-muted">Fermentando · día {fmtNumber(tank.day)}</span>
      )}

      <p className="m-0 line-clamp-2 text-xs text-fg-muted">{tank.lotName}</p>
      {tank.destination && (
        <p className="m-0 text-xs font-medium text-accent-text">
          {DESTINATION_SHORT[tank.destination] ?? DESTINATION[tank.destination]}
        </p>
      )}
    </Link>
  );
}

/** Cuadrícula de tanques (auto-fill de 168 px como la maqueta). */
export function TankGrid({ tanks }: { tanks: TankCardModel[] }) {
  return (
    <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-3 p-0" aria-label="Tanques">
      {tanks.map((t) => (
        <li key={t.id} className="grid">
          <TankCard tank={t} />
        </li>
      ))}
    </ul>
  );
}
