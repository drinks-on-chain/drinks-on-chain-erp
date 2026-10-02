import type { DossierPreview, DossierRequirementKey } from "@drinks-on-chain/mocks";

// Expediente del lote (contrato de la Ola 2 §10): los requisitos y si se cumplen los evalúa el
// servidor (`GET …/dossier/preview`); aquí solo se les pone título y a dónde ir para cumplirlos.

type Requirement = DossierPreview["requirements"][number];

const TITLE: Record<DossierRequirementKey, string> = {
  BOTTLED: "Lote embotellado",
  LAB_CONFORMING: "Laboratorio conforme",
  BOTTLE_CODES_READY: "Códigos de botella generados",
  NO_OPEN_COMPLIANCE_ISSUES: "Sin incidencias de cumplimiento abiertas",
  NO_OPEN_SOURCES: "Sin crianzas ni destilaciones abiertas",
};

/** Pestaña de la ficha (o pantalla) donde se resuelve cada requisito pendiente. */
const WHERE: Record<DossierRequirementKey, { label: string; path: (lotId: string) => string }> = {
  BOTTLED: { label: "Embotellar el lote", path: (id) => `/lotes/${id}/embotellar` },
  LAB_CONFORMING: { label: "Ir al laboratorio", path: (id) => `/lotes/${id}?pestana=laboratorio` },
  BOTTLE_CODES_READY: { label: "Ver los códigos", path: (id) => `/lotes/${id}?pestana=codigos` },
  NO_OPEN_COMPLIANCE_ISSUES: { label: "Ver las incidencias", path: (id) => `/lotes/${id}` },
  NO_OPEN_SOURCES: { label: "Ver los registros del lote", path: (id) => `/lotes/${id}` },
};

export type RequirementView = {
  key: DossierRequirementKey;
  title: string;
  /** Mensaje del servidor ("Falta registrar el análisis de laboratorio"). */
  message: string;
  met: boolean;
  /** Dónde resolverlo, solo si está pendiente. */
  action: { label: string; href: string } | null;
};

export function requirementViews(lotId: string, requirements: readonly Requirement[]): RequirementView[] {
  return requirements.map((r) => ({
    key: r.key,
    title: TITLE[r.key],
    message: r.message,
    met: r.met,
    action: r.met ? null : { label: WHERE[r.key].label, href: WHERE[r.key].path(lotId) },
  }));
}

/** "3 de 5 requisitos cumplidos". */
export function progressText(requirements: readonly Pick<Requirement, "met">[]): string {
  const met = requirements.filter((r) => r.met).length;
  return `${met} de ${requirements.length} requisitos cumplidos`;
}

/** Nombre del archivo del JSON canónico, por si el servidor no lo sugiere. */
export const canonicalFilename = (lot: { lotCode: string | null; reference: string }) =>
  `expediente-${lot.lotCode ?? lot.reference}.json`;
