import { deriveRestStatus, type LotChain, type LotKind, type LotStage, type LotView } from "@drinks-on-chain/mocks";
import { DESTINATION, PHYTO_STATUS, TANK_STATUS } from "@/lib/erp/labels";
import { fmtDate, fmtDaysLeft, fmtKg, fmtLiters, fmtNumber } from "@/lib/format";

// Vista "Lote" (09 §2): filtros del listado y línea de tiempo de la cadena
// terroir → pesaje → tanque → crianza | destilación → embotellado.

export type LotFilters = { stage: LotStage | "todas"; kind: LotKind | "todos"; q: string };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function filterLots(lots: LotView[], f: LotFilters): LotView[] {
  const q = norm(f.q.trim());
  return lots.filter(
    (l) =>
      (f.stage === "todas" || l.stage === f.stage) &&
      (f.kind === "todos" || l.kind === f.kind) &&
      (!q ||
        [l.harvestBatchCode, l.terroir.parcelName, l.terroir.varietyName, l.internationalLotCode ?? ""].some((s) =>
          norm(s).includes(q),
        )),
  );
}

const DAY_MS = 86_400_000;
const daysBetween = (fromIso: string, to: Date) => {
  const a = new Date(fromIso);
  const from = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const t = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.round((from - t) / DAY_MS);
};

export type LockInfo = { released: boolean; days: number; unlockAt: string | null; kind: "crianza" | "reposo" };

/** Candado del lote con los días que faltan a `today` (0 si está liberado). */
export function lotLock(lot: LotView, today: Date): LockInfo | null {
  const lock = lot.lock;
  if (!lock) return null;
  if (lock.kind === "reposo") {
    return {
      kind: "reposo",
      released: lock.released,
      days: lock.released ? 0 : lock.daysRemaining,
      unlockAt: lock.unlockAt,
    };
  }
  const days = Math.max(0, daysBetween(lock.unlockAt, today));
  return { kind: "crianza", released: lock.released || days === 0, days, unlockAt: lock.unlockAt };
}

export const lockLabel = (l: LockInfo | null) => (l ? fmtDaysLeft(l.days) : "—");

export type LotStep = {
  key: string;
  stage: string;
  title: string;
  time: string | null;
  detail: string | null;
  status: "done" | "current" | "pending";
  href: string | null;
};

/** Línea de tiempo de un lote de vendimia a partir de la cadena completa de la bodega. */
export function lotTimeline(harvestBatchId: string, chain: LotChain, today: Date): LotStep[] | null {
  const h = chain.harvestBatches.find((x) => x.id === harvestBatchId);
  if (!h) return null;
  const steps: LotStep[] = [];
  const t = chain.terroirs.find((x) => x.id === h.terroirId);

  steps.push({
    key: `terroir-${h.terroirId}`,
    stage: "Parcela",
    title: t ? `${t.parcelName} · ${t.varietyName}` : "Parcela",
    time: null,
    detail: t ? `${fmtNumber(t.altitudeMasl)} m s. n. m.${t.isDoEligible ? " · apta D.O." : ""}` : null,
    status: "done",
    href: `/origen/${h.terroirId}`,
  });

  const phyto = PHYTO_STATUS[h.phytosanitaryStatus];
  steps.push({
    key: `harvest-${h.id}`,
    stage: "Pesaje",
    title: h.harvestBatchCode,
    time: h.intakeDate,
    detail: `${fmtKg(h.netWeightKg)} netos · ${phyto.label}`,
    status:
      h.phytosanitaryStatus === "PENDING_INSPECTION" || h.phytosanitaryStatus === "QUARANTINE" ? "current" : "done",
    href: `/vendimia/${h.id}`,
  });
  if (h.phytosanitaryStatus === "REJECTED") return steps;

  const tanks = chain.tanks.filter((x) => x.harvestBatchId === h.id && x.status !== "CLEANED");
  for (const tk of tanks) {
    steps.push({
      key: `tank-${tk.id}`,
      stage: "Tanque",
      title: tk.tankCode,
      time: tk.startDate,
      detail: [
        TANK_STATUS[tk.status].label,
        tk.destinationType ? DESTINATION[tk.destinationType] : null,
        tk.volumeFilledLiters ? fmtLiters(tk.volumeFilledLiters) : null,
      ]
        .filter(Boolean)
        .join(" · "),
      status: tk.status === "FILLING" || tk.status === "FERMENTING" ? "current" : "done",
      href: `/vinificacion/${tk.id}`,
    });
  }
  if (tanks.length === 0) {
    steps.push(
      pending(
        "tank",
        "Tanque",
        "Fermentación",
        h.phytosanitaryStatus === "APPROVED" ? "Listo para llenar un tanque" : null,
      ),
    );
    steps.push(pending("next", "Crianza o destilación", "Siguiente etapa"));
    steps.push(pending("bottling", "Embotellado", "Envasado y QR"));
    return steps;
  }

  const tankIds = new Set(tanks.map((x) => x.id));
  const agings = chain.wineAgings.filter((a) => tankIds.has(a.fermentationTankId));
  const productions = chain.productionBatches.filter((p) => tankIds.has(p.fermentationTankId));
  for (const a of agings) {
    const days = Math.max(0, daysBetween(a.lockUntilDate, today));
    const bottled = a.agingStatus === "BOTTLED" || chain.bottlings.some((b) => b.wineAgingBatchId === a.id);
    steps.push({
      key: `aging-${a.id}`,
      stage: "Crianza",
      title: `${a.containerType} ${a.containerCode ?? ""}`.trim(),
      time: a.createdAt,
      detail: bottled
        ? `Embotellada · ${a.plannedMonths} meses`
        : days > 0
          ? `Candado hasta el ${fmtDate(a.lockUntilDate)} · ${fmtDaysLeft(days).toLowerCase()}`
          : `Liberada el ${fmtDate(a.lockUntilDate)}`,
      status: !bottled && days > 0 ? "current" : "done",
      href: `/crianza/${a.id}`,
    });
  }
  for (const p of productions) {
    const rest = deriveRestStatus(p, { today });
    const bottled = p.restStatus === "BOTTLED" || chain.bottlings.some((b) => b.productionBatchId === p.id);
    const resting = !bottled && p.restStatus !== "NOT_REQUIRED" && !rest.isRestCompleted;
    steps.push({
      key: `production-${p.id}`,
      stage: "Destilación",
      title: p.equipmentIdentifier,
      time: p.processStartDate,
      detail: bottled
        ? "Embotellada"
        : resting
          ? `Reposo hasta el ${p.mandatoryRestUntil ? fmtDate(p.mandatoryRestUntil) : "—"} · ${fmtDaysLeft(rest.daysRemaining).toLowerCase()}`
          : "Reposo cumplido · lista para embotellar",
      status: resting ? "current" : "done",
      href: `/destilacion/${p.id}`,
    });
  }
  if (agings.length === 0 && productions.length === 0) {
    const singani = tanks.some((x) => x.destinationType === "SINGANI_DIST");
    steps.push(pending("next", singani ? "Destilación" : "Crianza", singani ? "Alambique" : "Barrica"));
  }

  const agingIds = new Set(agings.map((a) => a.id));
  const productionIds = new Set(productions.map((p) => p.id));
  const bottlings = chain.bottlings.filter(
    (b) =>
      (b.wineAgingBatchId && agingIds.has(b.wineAgingBatchId)) ||
      (b.productionBatchId && productionIds.has(b.productionBatchId)),
  );
  for (const b of bottlings) {
    steps.push({
      key: `bottling-${b.id}`,
      stage: "Embotellado",
      title: b.internationalLotCode,
      time: b.bottlingDate,
      detail: `${fmtNumber(b.totalBottlesPackaged)} botellas · ${b.isAnchoredOnChain ? "anclado en Stellar" : "pendiente de anclaje"}`,
      status: "done",
      href: `/envasado/${b.id}`,
    });
  }
  if (bottlings.length === 0) steps.push(pending("bottling", "Embotellado", "Envasado y QR"));
  return steps;
}

function pending(key: string, stage: string, title: string, detail: string | null = null): LotStep {
  return { key: `pending-${key}`, stage, title, time: null, detail, status: "pending", href: null };
}
