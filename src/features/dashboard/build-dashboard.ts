import type { FermentationTankDetail, LotChain, LotView } from "@drinks-on-chain/mocks";

// Cálculo puro del Panel del ERP (03 §4, 1A): cifras, alertas, tareas y candados a partir de
// la cadena de la bodega. Sin React ni red, para probarlo con los fixtures.

/** Temperatura de fermentación a partir de la cual se avisa (°C). */
export const TEMP_ALERT_C = 26;

export type TaskKind = "phyto" | "quarantine" | "temperature" | "daily-log" | "bifurcate" | "bottle";

export type DashboardTask = {
  id: string;
  kind: TaskKind;
  title: string;
  subject: string;
  href: string;
  /** "Hoy", "Vencida"… */
  due: string;
  urgent: boolean;
};

export type DashboardLock = {
  harvestBatchId: string;
  title: string;
  kind: "crianza" | "reposo";
  unlockAt: string | null;
  daysRemaining: number;
  released: boolean;
};

export type Dashboard = {
  activeLots: number;
  lotsThisWeek: number;
  kgToday: number;
  intakesToday: number;
  fermenting: number;
  tanksInUse: number;
  readyToBifurcate: number;
  alerts: { count: number; detail: string | null };
  tasks: DashboardTask[];
  locks: DashboardLock[];
};

const DAY = 86_400_000;
const dayKey = (d: Date | string) => new Date(d).toISOString().slice(0, 10);

export function buildDashboard(input: {
  chain: LotChain;
  lots: LotView[];
  /** Detalle (con lecturas) de los tanques en fermentación. */
  tankDetails: FermentationTankDetail[];
  today: Date;
}): Dashboard {
  const { chain, lots, tankDetails, today } = input;
  const todayKey = dayKey(today);
  const weekAgo = today.getTime() - 7 * DAY;

  const active = lots.filter((l) => l.stage !== "embotellado" && l.stage !== "rechazado");
  const harvestById = new Map(chain.harvestBatches.map((h) => [h.id, h]));
  const terroirById = new Map(chain.terroirs.map((t) => [t.id, t]));
  const intakesToday = chain.harvestBatches.filter((h) => dayKey(h.intakeDate) === todayKey);

  const fermenting = chain.tanks.filter((t) => t.status === "FERMENTING");
  const inUse = chain.tanks.filter((t) => t.status !== "CLEANED" && t.status !== "TRANSFERRED");
  const completed = chain.tanks.filter((t) => t.status === "COMPLETED");

  const lotName = (harvestBatchId: string) => {
    const h = harvestById.get(harvestBatchId);
    const t = h ? terroirById.get(h.terroirId) : undefined;
    return t ? `${t.parcelName} · ${t.varietyName}` : (h?.harvestBatchCode ?? "Lote");
  };

  const tasks: DashboardTask[] = [];
  let alertCount = 0;
  let alertDetail: string | null = null;

  for (const h of chain.harvestBatches) {
    if (h.phytosanitaryStatus === "PENDING_INSPECTION") {
      const overdue = dayKey(h.intakeDate) < todayKey;
      tasks.push({
        id: `phyto-${h.id}`,
        kind: "phyto",
        title: "Dictaminar ingreso de uva",
        subject: `${lotName(h.id)} · ${h.netWeightKg.toLocaleString("es-BO")} kg`,
        href: `/vendimia/${h.id}`,
        due: overdue ? "Vencida" : "Hoy",
        urgent: overdue,
      });
    }
    if (h.phytosanitaryStatus === "QUARANTINE") {
      alertCount++;
      alertDetail ??= `Cuarentena · ${h.harvestBatchCode}`;
      tasks.push({
        id: `quarantine-${h.id}`,
        kind: "quarantine",
        title: "Resolver lote en cuarentena",
        subject: lotName(h.id),
        href: `/vendimia/${h.id}`,
        due: "Pendiente",
        urgent: true,
      });
    }
  }

  for (const tank of tankDetails) {
    const logs = [...(tank.logs ?? [])].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
    const last = logs[0];
    if (last && last.temperatureCelsius > TEMP_ALERT_C) {
      alertCount++;
      alertDetail = `Temperatura · ${tank.tankCode}`;
      tasks.push({
        id: `temp-${tank.id}`,
        kind: "temperature",
        title: "Revisar temperatura",
        subject: `${tank.tankCode} · ${last.temperatureCelsius.toFixed(1)} °C`,
        href: `/vinificacion/${tank.id}`,
        due: "Ahora",
        urgent: true,
      });
    }
    if (!last || dayKey(last.recordedAt) < todayKey) {
      tasks.push({
        id: `log-${tank.id}`,
        kind: "daily-log",
        title: "Registrar lectura diaria",
        subject: `${tank.tankCode} · ${lotName(tank.harvestBatchId)}`,
        href: `/vinificacion/${tank.id}`,
        due: "Hoy",
        urgent: false,
      });
    }
  }

  for (const tank of completed) {
    tasks.push({
      id: `bifurcate-${tank.id}`,
      kind: "bifurcate",
      title: tank.destinationType === "SINGANI_DIST" ? "Pasar a destilación" : "Pasar a crianza",
      subject: `${tank.tankCode} · ${lotName(tank.harvestBatchId)}`,
      href: `/vinificacion/${tank.id}`,
      due: "Pendiente",
      urgent: false,
    });
  }

  const locks: DashboardLock[] = [];
  for (const l of lots) {
    if (!l.lock || l.stage === "embotellado") continue;
    const unlockAt = l.lock.unlockAt;
    const daysRemaining =
      l.lock.kind === "reposo"
        ? l.lock.daysRemaining
        : Math.max(0, Math.ceil((new Date(l.lock.unlockAt).getTime() - today.getTime()) / DAY));
    const released = l.lock.released || daysRemaining === 0;
    locks.push({
      harvestBatchId: l.harvestBatchId,
      title: `${l.terroir.parcelName} · ${l.terroir.varietyName}`,
      kind: l.lock.kind,
      unlockAt,
      daysRemaining,
      released,
    });
    if (released) {
      tasks.push({
        id: `bottle-${l.harvestBatchId}`,
        kind: "bottle",
        title: "Embotellar lote liberado",
        subject: `${l.terroir.parcelName} · ${l.terroir.varietyName}`,
        href: `/envasado/nuevo?lote=${l.harvestBatchId}`,
        due: "Disponible",
        urgent: false,
      });
    }
  }
  locks.sort((a, b) => Number(a.released) - Number(b.released) || a.daysRemaining - b.daysRemaining);
  tasks.sort((a, b) => Number(b.urgent) - Number(a.urgent));

  return {
    activeLots: active.length,
    lotsThisWeek: chain.harvestBatches.filter((h) => new Date(h.intakeDate).getTime() >= weekAgo).length,
    kgToday: intakesToday.reduce((s, h) => s + h.netWeightKg, 0),
    intakesToday: intakesToday.length,
    fermenting: fermenting.length,
    tanksInUse: inUse.length,
    readyToBifurcate: completed.length,
    alerts: { count: alertCount, detail: alertDetail },
    tasks,
    locks,
  };
}
