import type { LotStageCode } from "@drinks-on-chain/mocks";
import type { TraceDashboard } from "@/lib/erp/schemas";
import { fmtDate, fmtDateTime, fmtNumber } from "@/lib/format";

// Panel de la bodega (contrato de la Ola 2 §11.2): el servidor entrega los lotes por etapa, los
// candados por vencer, las alertas de fermentación (> 32 °C o 48 h sin lecturas), la uva sin
// dictamen, los lotes embotellados sin laboratorio y los que ya pueden cerrar su expediente. Aquí
// solo se ordena en cifras y tareas; ningún umbral se calcula en el cliente.

export type TaskKind =
  "phyto" | "quarantine" | "temperature" | "no-reading" | "bottle" | "lab" | "close" | "issues" | "unassigned";

export type DashboardTask = {
  id: string;
  kind: TaskKind;
  title: string;
  subject: string;
  href: string;
  /** "Ahora", "Pendiente", "Disponible"… */
  due: string;
  urgent: boolean;
};

export const TASK_ACTION: Record<TaskKind, string> = {
  phyto: "Dictaminar",
  quarantine: "Revisar",
  temperature: "Revisar",
  "no-reading": "Registrar",
  bottle: "Embotellar",
  lab: "Registrar",
  close: "Cerrar",
  issues: "Ver",
  unassigned: "Ver",
};

const ACTIVE: readonly LotStageCode[] = ["ORIGIN", "HARVEST", "FERMENTING", "AGING", "DISTILLING", "RESTING"];
const BOTTLED: readonly LotStageCode[] = ["BOTTLED", "CERTIFIED", "ANCHORED"];

export type DashboardView = {
  activeLots: number;
  bottledLots: number;
  fermentingLots: number;
  /** Candados que se liberan en ≤ 14 días (o ya liberados sin embotellar). */
  locksDueSoon: number;
  alerts: { count: number; detail: string | null };
  tasks: DashboardTask[];
  locks: TraceDashboard["locksDueSoon"];
  /** Etapas con algún lote, en el orden del proceso. */
  stages: { stage: LotStageCode; count: number }[];
};

const STAGE_ORDER: readonly LotStageCode[] = [
  "ORIGIN",
  "HARVEST",
  "FERMENTING",
  "AGING",
  "DISTILLING",
  "RESTING",
  "BOTTLED",
  "CERTIFIED",
  "ANCHORED",
  "REJECTED",
  "DISCARDED",
];

/** "Singani Gran Reserva 2026 · CVJ-2026-SINGANI-004" (los lotes migrados se llaman como su código). */
function lotSubject(lot: { name: string; lotCode: string | null; reference: string }): string {
  const code = lot.lotCode ?? lot.reference;
  return lot.name === code ? code : `${lot.name} · ${code}`;
}

export function dashboardView(d: TraceDashboard): DashboardView {
  const sum = (stages: readonly LotStageCode[]) => stages.reduce((total, s) => total + d.lotsByStage[s], 0);
  const tasks: DashboardTask[] = [];

  for (const a of d.fermentationAlerts) {
    if (a.kind === "HIGH_TEMPERATURE") {
      tasks.push({
        id: `temp-${a.tankId}`,
        kind: "temperature",
        title: "Revisar temperatura de fermentación",
        subject: `${a.tankCode}${a.value != null ? ` · ${fmtNumber(a.value, 1)} °C` : ""}`,
        href: `/vinificacion/${a.tankId}`,
        due: "Ahora",
        urgent: true,
      });
    } else {
      tasks.push({
        id: `reading-${a.tankId}`,
        kind: "no-reading",
        title: "Registrar lectura del tanque",
        subject: `${a.tankCode} · ${a.lastReadingAt ? `última lectura el ${fmtDateTime(a.lastReadingAt)}` : "sin lecturas"}`,
        href: `/vinificacion/${a.tankId}`,
        due: "Más de 48 h",
        urgent: true,
      });
    }
  }

  for (const h of d.pendingPhyto) {
    const quarantine = h.status === "QUARANTINE";
    tasks.push({
      id: `phyto-${h.harvestBatchId}`,
      kind: quarantine ? "quarantine" : "phyto",
      title: quarantine ? "Resolver uva en cuarentena" : "Dictaminar ingreso de uva",
      subject: `${h.harvestBatchCode} · pesada el ${fmtDate(h.intakeDate)}`,
      href: `/vendimia/${h.harvestBatchId}`,
      due: "Pendiente",
      urgent: quarantine,
    });
  }

  for (const l of d.locksDueSoon) {
    if (!l.lock.released) continue;
    tasks.push({
      id: `bottle-${l.lotId}`,
      kind: "bottle",
      title: "Embotellar lote liberado",
      subject: `${l.name} · ${l.reference}`,
      href: `/lotes/${l.lotId}/embotellar`,
      due: "Disponible",
      urgent: false,
    });
  }

  for (const lot of d.bottledWithoutLab) {
    tasks.push({
      id: `lab-${lot.id}`,
      kind: "lab",
      title: "Registrar el laboratorio del lote",
      subject: lotSubject(lot),
      href: `/lotes/${lot.id}?pestana=laboratorio`,
      due: "Pendiente",
      urgent: false,
    });
  }

  for (const lot of d.readyToClose) {
    tasks.push({
      id: `close-${lot.id}`,
      kind: "close",
      title: "Cerrar el expediente",
      subject: lotSubject(lot),
      href: `/lotes/${lot.id}?pestana=expediente`,
      due: "Listo",
      urgent: false,
    });
  }

  if (d.complianceIssuesOpen > 0) {
    tasks.push({
      id: "issues",
      kind: "issues",
      title: "Revisar incidencias de cumplimiento",
      subject:
        d.complianceIssuesOpen === 1
          ? "1 incidencia abierta"
          : `${fmtNumber(d.complianceIssuesOpen)} incidencias abiertas`,
      href: "/lotes?incidencias=1",
      due: "Pendiente",
      urgent: true,
    });
  }

  if (d.unassignedHarvestBatches > 0) {
    tasks.push({
      id: "unassigned",
      kind: "unassigned",
      title: "Asignar la uva sin lote",
      subject:
        d.unassignedHarvestBatches === 1
          ? "1 pesaje sin lote"
          : `${fmtNumber(d.unassignedHarvestBatches)} pesajes sin lote`,
      href: "/vendimia",
      due: "Pendiente",
      urgent: false,
    });
  }

  tasks.sort((a, b) => Number(b.urgent) - Number(a.urgent));

  const quarantined = d.pendingPhyto.filter((h) => h.status === "QUARANTINE");
  const alertCount = d.fermentationAlerts.length + quarantined.length + d.complianceIssuesOpen;
  const firstAlert = d.fermentationAlerts[0];
  const alertDetail = firstAlert
    ? `${firstAlert.kind === "HIGH_TEMPERATURE" ? "Temperatura" : "Sin lecturas"} · ${firstAlert.tankCode}`
    : quarantined[0]
      ? `Cuarentena · ${quarantined[0].harvestBatchCode}`
      : d.complianceIssuesOpen > 0
        ? "Incidencias de cumplimiento"
        : null;

  return {
    activeLots: sum(ACTIVE),
    bottledLots: sum(BOTTLED),
    fermentingLots: d.lotsByStage.FERMENTING,
    locksDueSoon: d.locksDueSoon.length,
    alerts: { count: alertCount, detail: alertDetail },
    tasks,
    locks: [...d.locksDueSoon].sort(
      (a, b) => Number(a.lock.released) - Number(b.lock.released) || a.lock.daysRemaining - b.lock.daysRemaining,
    ),
    stages: STAGE_ORDER.map((stage) => ({ stage, count: d.lotsByStage[stage] })).filter((s) => s.count > 0),
  };
}
