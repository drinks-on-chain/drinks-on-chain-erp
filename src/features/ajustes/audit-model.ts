import type { AuditEvent } from "@drinks-on-chain/mocks";
import type { AuditQuery } from "@/lib/erp/resources";

// Bitácora propia de la bodega (contrato de la Ola 1 §7, `GET /v1/organizations/current/audit`):
// lo que afecta a la bodega, también lo que hizo la plataforma. Solo la dirección la ve.

export const AUDIT_PAGE_SIZE = 20;

/** Acciones que afectan a una bodega, agrupadas para el filtro. Una acción desconocida se muestra con su código. */
export const AUDIT_ACTION_GROUPS: { label: string; actions: Record<string, string> }[] = [
  {
    label: "Equipo",
    actions: {
      INVITATION_CREATED: "Invitación enviada",
      INVITATION_RESENT: "Invitación reenviada",
      INVITATION_REVOKED: "Invitación anulada",
      INVITATION_ACCEPTED: "Invitación aceptada",
      INVITATION_EXPIRED: "Invitación caducada",
      MEMBER_JOINED: "Alta en el equipo",
      MEMBER_ROLE_CHANGED: "Cambio de rol",
      MEMBER_BLOCKED: "Miembro bloqueado",
      MEMBER_UNBLOCKED: "Miembro desbloqueado",
      USER_CREATED: "Cuenta creada",
    },
  },
  {
    label: "Bodega",
    actions: {
      WINERY_CREATED: "Bodega dada de alta",
      WINERY_ACTIVATED: "Bodega activada",
      WINERY_UPDATED: "Datos de la bodega cambiados",
      WINERY_SUSPENDED: "Bodega suspendida",
      WINERY_REACTIVATED: "Bodega reactivada",
      WINERY_REVOKED: "Bodega revocada",
      WINERY_OWNERSHIP_TRANSFER_STARTED: "Transferencia de titularidad iniciada",
      WINERY_OWNERSHIP_TRANSFERRED: "Titularidad transferida",
    },
  },
  {
    label: "Configuración",
    actions: {
      SETTING_CHANGED: "Estándar cambiado",
      SETTING_OVERRIDE_SET: "Ajuste propio fijado",
      SETTING_OVERRIDE_RESET: "Vuelta al estándar",
    },
  },
  {
    label: "Trazabilidad",
    actions: {
      TERROIR_CREATED: "Terroir registrado",
      TERROIR_UPDATED: "Terroir editado",
      HARVEST_BATCH_CREATED: "Ingreso de uva",
      PHYTOSANITARY_STATUS_CHANGED: "Dictamen fitosanitario",
      FERMENTATION_TANK_CREATED: "Tanque llenado",
      FERMENTATION_LOG_RECORDED: "Lectura de tanque",
      ENOLOGICAL_TREATMENT_RECORDED: "Tratamiento enológico",
      WINE_AGING_STARTED: "Crianza iniciada",
      DISTILLATION_RECORDED: "Destilación registrada",
      BOTTLING_RECORDED: "Embotellado",
      LAB_ANALYSIS_RECORDED: "Análisis de laboratorio",
      FILE_UPLOADED: "Archivo subido",
    },
  },
];

const ACTION_LABELS: Record<string, string> = Object.assign({}, ...AUDIT_ACTION_GROUPS.map((g) => g.actions));

export const auditActionLabel = (action: string) => ACTION_LABELS[action] ?? action;

const SOURCE_LABELS: Record<AuditEvent["source"]["app"], string> = {
  ERP: "ERP",
  MARKETPLACE: "Marketplace",
  BACKOFFICE: "Backoffice",
  POS: "Punto de canje",
  PUBLIC: "Web pública",
  API: "API",
  WORKER: "Proceso automático",
};

export const auditSourceLabel = (app: AuditEvent["source"]["app"]) => SOURCE_LABELS[app] ?? app;

/** Quién: la persona (y si actuó desde la plataforma) o "Sistema". */
export function auditActor(event: AuditEvent): { name: string; viaPlatform: boolean } {
  return { name: event.actor.fullName ?? "Sistema", viaPlatform: event.actor.viaPlatform };
}

export type AuditFilters = { from: string | null; to: string | null; action: string };

export const emptyAuditFilters = (): AuditFilters => ({ from: null, to: null, action: "" });

/** Consulta de la API a partir de los filtros y la página (fechas `AAAA-MM-DD`, día completo). */
export function auditQuery(filters: AuditFilters, offset: number): AuditQuery {
  const q: AuditQuery = { limit: AUDIT_PAGE_SIZE, offset: Math.max(0, offset) };
  if (filters.from) q.from = filters.from;
  if (filters.to) q.to = filters.to;
  if (filters.action) q.action = filters.action;
  return q;
}

const show = (v: unknown): string => {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "sí" : "no";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
};

/** Cambios de `before` a `after` como líneas "campo: antes → después" (o "campo: valor" si solo hay uno). */
export function auditChanges(event: Pick<AuditEvent, "before" | "after">): string[] {
  const before = event.before ?? {};
  const after = event.after ?? {};
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  return keys.map((k) => {
    const hasBefore = k in before;
    const hasAfter = k in after;
    if (hasBefore && hasAfter) return `${k}: ${show(before[k])} → ${show(after[k])}`;
    return `${k}: ${show(hasAfter ? after[k] : before[k])}`;
  });
}
