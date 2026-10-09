import type {
  AgingStatus,
  BeverageCategory,
  CertificationStatus,
  ComplianceIssue,
  DestinationType,
  DoStatus,
  LotEventType,
  LotLabStatus,
  LotLockInfo,
  LotProductType,
  LotStageCode,
  PhytosanitaryStatus,
  ProductType,
  RestStatus,
  TankStatus,
  TreatmentType,
} from "@drinks-on-chain/mocks";
import type { Tone } from "@drinks-on-chain/ui";

// Textos y tonos de los estados del dominio. Regla de color (01-erp §1): info en curso,
// ámbar candados y esperas, verde aprobado/listo, rojo solo rechazo o alerta, oro lo decisivo.

type Label = { label: string; tone: Tone };

export const PHYTO_STATUS: Record<PhytosanitaryStatus, Label> = {
  PENDING_INSPECTION: { label: "Pendiente de inspección", tone: "warning" },
  APPROVED: { label: "Aprobado", tone: "success" },
  REJECTED: { label: "Rechazado", tone: "danger" },
  QUARANTINE: { label: "En cuarentena", tone: "danger" },
};

export const TANK_STATUS: Record<TankStatus, Label> = {
  FILLING: { label: "Llenando", tone: "info" },
  FERMENTING: { label: "Fermentando", tone: "info" },
  COMPLETED: { label: "Fermentación terminada", tone: "accent" },
  TRANSFERRED: { label: "Trasegado", tone: "neutral" },
  CLEANED: { label: "Vacío", tone: "neutral" },
};

export const DESTINATION: Record<DestinationType, string> = {
  WINE_AGING: "Crianza (vino)",
  SINGANI_DIST: "Destilación (singani)",
  BEER_MATURATION: "Maduración de cerveza",
  SPIRITS_DIST: "Destilación de espirituosos",
  OTHER: "Otro",
};

export const AGING_STATUS: Record<AgingStatus, Label> = {
  AGING: { label: "En crianza", tone: "warning" },
  READY: { label: "Liberado", tone: "success" },
  BOTTLED: { label: "Embotellado", tone: "neutral" },
  DISCARDED: { label: "Descartado", tone: "danger" },
};

export const REST_STATUS: Record<RestStatus, Label> = {
  NOT_REQUIRED: { label: "Sin reposo", tone: "neutral" },
  RESTING: { label: "En reposo", tone: "warning" },
  READY: { label: "Listo", tone: "success" },
  BOTTLED: { label: "Embotellado", tone: "neutral" },
  DISCARDED: { label: "Descartado", tone: "danger" },
};

export const PRODUCT_TYPE: Record<ProductType, string> = {
  WINE: "Vino",
  SINGANI: "Singani",
  BEER: "Cerveza",
  SPIRITS: "Espirituoso",
  CIDER: "Sidra",
  MEAD: "Hidromiel",
  OTHER: "Otro",
};

export const TREATMENT_TYPE: Record<TreatmentType, string> = {
  ACIDITY_CORRECTION: "Corrección de acidez",
  SO2_ADDITION: "Adición de SO₂",
  CLARIFICATION: "Clarificación",
  FILTRATION_AID: "Coadyuvante de filtración",
  NUTRIENT_ADDITION: "Nutrientes",
  ENZYME_ADDITION: "Enzimas",
  OAK_CHIPS: "Chips de roble",
  FINING_AGENT: "Clarificante",
  STABILIZATION: "Estabilización",
  OTHER: "Otro",
};

export const CERTIFICATION_STATUS: Record<CertificationStatus, Label> = {
  INVITED: { label: "Invitada: pendiente de activación", tone: "info" },
  ACTIVE: { label: "Activa", tone: "success" },
  SUSPENDED: { label: "Suspendida", tone: "warning" },
  REVOKED: { label: "Revocada", tone: "danger" },
};

export const BEVERAGE_CATEGORY: Record<BeverageCategory, string> = {
  WINERY: "Bodega de vinos",
  BREWERY: "Cervecería",
  DISTILLERY: "Destilería",
  OTHER: "Otra",
};

// ---------------------------------------------------------------------------
// Lote del servidor (contrato de la Ola 2 §2, §8, §11)
// ---------------------------------------------------------------------------

/** Etapas del lote, en el orden del proceso. */
export const LOT_STAGE_CODE: Record<LotStageCode, Label> = {
  ORIGIN: { label: "Origen", tone: "neutral" },
  HARVEST: { label: "Vendimia", tone: "info" },
  FERMENTING: { label: "Fermentación", tone: "info" },
  AGING: { label: "Crianza", tone: "warning" },
  DISTILLING: { label: "Destilación", tone: "info" },
  RESTING: { label: "Reposo", tone: "warning" },
  BOTTLED: { label: "Embotellado", tone: "success" },
  CERTIFIED: { label: "Expediente cerrado", tone: "success" },
  // Etapa final (Ola 3 §7.2): el expediente cerrado pasa solo a anclado cuando la red lo confirma.
  ANCHORED: { label: "Anclado en la red", tone: "success" },
  REJECTED: { label: "Rechazado", tone: "danger" },
  DISCARDED: { label: "Descartado", tone: "neutral" },
};

export const LOT_PRODUCT: Record<LotProductType, string> = { WINE: "Vino", SINGANI: "Singani" };

export const LOT_LAB_STATUS: Record<LotLabStatus, Label> = {
  NOT_RECORDED: { label: "Sin análisis", tone: "neutral" },
  CONFORMING: { label: "Conforme", tone: "success" },
  NON_CONFORMING: { label: "No conforme", tone: "danger" },
  INCOMPLETE: { label: "Incompleto", tone: "warning" },
};

export const DO_STATUS: Record<DoStatus, Label> = {
  ELIGIBLE: { label: "Apto para D.O. Singani", tone: "success" },
  ELIGIBLE_BY_EXCEPTION: { label: "Apto por excepción legal", tone: "warning" },
  NOT_ELIGIBLE: { label: "No apto para D.O. Singani", tone: "danger" },
  NOT_APPLICABLE: { label: "D.O. no aplica", tone: "neutral" },
};

export const LOCK_KIND: Record<LotLockInfo["kind"], string> = {
  AGING: "Candado de crianza",
  REST: "Reposo obligatorio",
};

export const COMPLIANCE_SOURCE: Record<ComplianceIssue["source"], string> = {
  MIGRATION: "Detectada al migrar los datos",
  CORRECTION: "Surgió de una corrección",
  RULES_REEVALUATION: "Surgió al reevaluar las reglas",
};

export const LOT_EVENT: Record<LotEventType, string> = {
  LOT_CREATED: "Lote creado",
  ESTIMATE_CHANGED: "Estimación de botellas",
  HARVEST_WEIGHED: "Pesaje",
  MATURITY_ANALYZED: "Análisis de madurez",
  PHYTO_DECIDED: "Dictamen fitosanitario",
  TANK_FILLED: "Tanque lleno",
  FERMENTATION_STARTED: "Inicio de fermentación",
  FERMENTATION_READINGS: "Lecturas de fermentación",
  TREATMENT_APPLIED: "Tratamiento enológico",
  FERMENTATION_COMPLETED: "Fermentación terminada",
  PRODUCT_DECIDED: "Destino decidido",
  AGING_STARTED: "Inicio de crianza",
  DISTILLATION_STARTED: "Inicio de destilación",
  DISTILLATION_CLOSED: "Destilación cerrada",
  LOCK_RELEASED: "Candado liberado",
  BOTTLED: "Embotellado",
  BOTTLE_CODES_GENERATED: "Códigos de botella",
  BOTTLE_CODE_VOIDED: "Código anulado",
  LAB_REGISTERED: "Laboratorio",
  CORRECTION: "Corrección",
  FILE_ATTACHED: "Archivo adjunto",
  DOSSIER_CLOSED: "Expediente cerrado",
  LOT_REJECTED: "Lote rechazado",
  LOT_DISCARDED: "Lote descartado",
  // Ola 3 (contrato de tokenización §11)
  TOKENIZATION_AUTHORIZED: "Tokenización autorizada",
  NFT_MINTED: "NFT emitidos",
  COLLECTION_PUBLISHED: "Colección publicada",
  DOSSIER_ANCHORED: "Expediente anclado",
  TOKENS_REDEEMABLE: "NFT canjeables",
  SHORTFALL_DETECTED: "Faltante de botellas",
};

/** Parámetros de los límites de laboratorio de la instantánea de reglas (`rules.lab.limits`). */
export const LAB_PARAMETER: Record<string, string> = {
  metanol: "Metanol",
  cobre: "Cobre",
  acidezVolatil: "Acidez volátil",
  acidezTotal: "Acidez total",
  grado: "Grado alcohólico",
  so2Libre: "SO₂ libre",
  so2Total: "SO₂ total",
  azucaresReductores: "Azúcares reductores",
};

/** Nombre de un parámetro de laboratorio (`acidezVolatil` → "Acidez volátil"); los desconocidos, tal cual. */
export const labParameterLabel = (parameter: string): string => LAB_PARAMETER[parameter] ?? parameter;
