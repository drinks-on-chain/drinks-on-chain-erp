import type {
  AgingStatus,
  BeverageCategory,
  CertificationStatus,
  DestinationType,
  LotKind,
  LotStage,
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

export const LOT_STAGE: Record<LotStage, Label> = {
  pesaje: { label: "Pesaje", tone: "neutral" },
  vendimia: { label: "Vendimia", tone: "info" },
  fermentacion: { label: "Fermentación", tone: "info" },
  bifurcacion: { label: "Por bifurcar", tone: "accent" },
  crianza: { label: "Crianza", tone: "warning" },
  reposo: { label: "Reposo", tone: "warning" },
  embotellado: { label: "Embotellado", tone: "success" },
  rechazado: { label: "Rechazado", tone: "danger" },
};

export const LOT_KIND: Record<LotKind, string> = { vino: "Vino", singani: "Singani" };

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
  PENDING: { label: "Pendiente de aprobación", tone: "warning" },
  ACTIVE: { label: "Activa", tone: "success" },
  SUSPENDED: { label: "Suspendida", tone: "danger" },
  REVOKED: { label: "Revocada", tone: "danger" },
};

export const BEVERAGE_CATEGORY: Record<BeverageCategory, string> = {
  WINERY: "Bodega de vinos",
  BREWERY: "Cervecería",
  DISTILLERY: "Destilería",
  OTHER: "Otra",
};
