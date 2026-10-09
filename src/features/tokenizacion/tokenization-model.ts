import type {
  CollectionImageInput,
  CreateTokenizationRequest,
  LotTokenizationMark,
  TokenizationLimits,
  TokenizationRequest,
  TokenizationRequestKind,
  TokenizationRequestStatus,
  TokenizationRequestSummary,
  UpdateTokenizationRequest,
  WineryLotClosure,
} from "@drinks-on-chain/mocks";
import type { Tone } from "@drinks-on-chain/ui";
import { fieldErrorsFrom } from "@/lib/api/field-errors";
import { fmtNumber, parseDecimal } from "@/lib/format";

// Tokenización del lote (1K, contrato de la Ola 3 §5): textos de la marca, del límite y de la
// solicitud, y el formulario `TokenizationRequestForm`. La cuota, sus límites y los bloqueos los
// decide el servidor (`GET /v1/lots/{id}/tokenization`); aquí solo se muestran y se valida la forma
// de lo que se envía.

type Label = { label: string; tone: Tone };

// ---------------------------------------------------------------------------
// Marca en la lista de lotes
// ---------------------------------------------------------------------------

export const TOKENIZATION_MARK: Record<Exclude<LotTokenizationMark["state"], "NONE">, Label> = {
  REQUESTED: { label: "Solicitud enviada", tone: "info" },
  CHANGES_REQUESTED: { label: "Cambios pedidos", tone: "warning" },
  MINTING: { label: "Emitiendo NFT", tone: "info" },
  MINT_FAILED: { label: "Emisión fallida", tone: "danger" },
  READY: { label: "NFT emitidos", tone: "success" },
  PUBLISHED: { label: "Publicada", tone: "success" },
  PAUSED: { label: "Pausada", tone: "warning" },
  CLOSED: { label: "Cerrada", tone: "neutral" },
};

export type MarkView = Label & { detail: string | null };

/** Marca de tokenización de un lote; `null` si no tiene solicitud ni colección. */
export function markView(mark: LotTokenizationMark): MarkView | null {
  if (mark.state === "NONE") return null;
  const base = TOKENIZATION_MARK[mark.state];
  const detail = mark.quota > 0 ? `${fmtNumber(mark.minted)} de ${fmtNumber(mark.quota)} NFT` : null;
  return { ...base, detail };
}

// ---------------------------------------------------------------------------
// Solicitud
// ---------------------------------------------------------------------------

export const REQUEST_KIND: Record<TokenizationRequestKind, string> = {
  INITIAL: "Autorización",
  QUOTA_INCREASE: "Ampliación de cuota",
};

export const REQUEST_STATUS_FILTERS: readonly { value: TokenizationRequestStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "Todas" },
  { value: "SUBMITTED", label: "Enviadas" },
  { value: "IN_REVIEW", label: "En revisión" },
  { value: "CHANGES_REQUESTED", label: "Cambios pedidos" },
  { value: "APPROVED", label: "Aprobadas" },
  { value: "REJECTED", label: "Rechazadas" },
  { value: "WITHDRAWN", label: "Retiradas" },
];

const OPEN: readonly TokenizationRequestStatus[] = ["SUBMITTED", "IN_REVIEW", "CHANGES_REQUESTED"];

export const isOpenRequest = (r: Pick<TokenizationRequestSummary, "status">) => OPEN.includes(r.status);

type ActionRequest = Pick<TokenizationRequestSummary, "status" | "assignee">;

/**
 * Qué puede hacer el dueño con la solicitud (§5.3): editar con cambios pedidos o mientras nadie la
 * haya tomado, reenviar con cambios pedidos y retirar mientras esté abierta. Si el estado cambió
 * entre tanto, el servidor responde 409 y la pantalla lo explica.
 */
export function requestActions(r: ActionRequest, canManage: boolean) {
  if (!canManage) return { edit: false, resubmit: false, withdraw: false };
  const changes = r.status === "CHANGES_REQUESTED";
  return {
    edit: changes || (r.status === "SUBMITTED" && r.assignee === null),
    resubmit: changes,
    withdraw: isOpenRequest(r),
  };
}

/** Qué espera la solicitud, dicho para la bodega. */
export function requestStatusText(r: Pick<TokenizationRequestSummary, "status" | "requiresApproval">): string {
  switch (r.status) {
    case "SUBMITTED":
      return "Drinks on Chain la recibió y la revisará. No se emite nada hasta que la apruebe.";
    case "IN_REVIEW":
      return "El equipo de operaciones de Drinks on Chain la está revisando.";
    case "CHANGES_REQUESTED":
      return "Drinks on Chain pidió cambios. Edítala y reenvíala para que continúe la revisión.";
    case "APPROVED":
      return r.requiresApproval
        ? "Aprobada por Drinks on Chain: los NFT se emiten a nombre de la bodega."
        : "Aprobada automáticamente: los NFT se emiten a nombre de la bodega.";
    case "REJECTED":
      return "Drinks on Chain la rechazó. Puedes enviar otra cuando resuelvas el motivo.";
    case "WITHDRAWN":
      return "La bodega la retiró antes de que se decidiera.";
  }
}

/** «100 botellas» / «50 botellas más (150 en total)». */
export function requestQuantityText(r: Pick<TokenizationRequestSummary, "kind" | "quantity" | "resultingQuota">) {
  const bottles = (n: number) => `${fmtNumber(n)} ${n === 1 ? "botella" : "botellas"}`;
  return r.kind === "QUOTA_INCREASE"
    ? `${bottles(r.quantity)} más (${fmtNumber(r.resultingQuota)} en total)`
    : bottles(r.quantity);
}

/** Peticiones de cambio aún sin resolver, la más reciente primero. */
export const pendingChangeRequests = (r: Pick<TokenizationRequest, "changeRequests">) =>
  r.changeRequests.filter((c) => c.resolvedAt === null).sort((a, b) => b.at.localeCompare(a.at));

const FIELD_LABEL: Record<string, string> = {
  quantity: "Cuota",
  notes: "Notas para Drinks on Chain",
  "commercial.name": "Nombre de la colección",
  "commercial.description": "Descripción",
  "commercial.tastingNotes": "Notas de cata",
  "commercial.pairing": "Maridaje",
  "commercial.imageKeys": "Fotos",
  "commercial.estimatedRedeemDate": "Fecha estimada de canje",
};

/** Nombre de un campo señalado en una petición de cambios (`fields`); los desconocidos, tal cual. */
export const changeFieldLabel = (field: string): string => FIELD_LABEL[field] ?? field;

// ---------------------------------------------------------------------------
// Límite de la cuota
// ---------------------------------------------------------------------------

export type LimitsView = {
  /** «estimación» o «botellas»: sobre qué se calcula el máximo. */
  basis: "estimación" | "botellas";
  basisText: string;
  /** El límite del lote (estimación o botellas con código activo). */
  limit: number | null;
  authorized: number;
  pending: number;
  max: number;
  /** «Puedes autorizar hasta 2.900 botellas: la estimación del lote es 3.000 y ya hay 100 autorizadas.» */
  summary: string;
};

export function limitsView(l: TokenizationLimits): LimitsView {
  const byBottles = l.basis === "BOTTLES";
  const limit = byBottles ? l.bottles : l.estimatedBottles;
  const taken = l.authorizedQuota + l.pendingQuantity;
  const source =
    limit == null
      ? byBottles
        ? "el lote aún no tiene botellas con código"
        : "el lote aún no tiene estimación de botellas"
      : byBottles
        ? `el lote tiene ${fmtNumber(limit)} botellas embotelladas`
        : `la estimación del lote es ${fmtNumber(limit)}`;
  const already =
    taken > 0
      ? ` y ya hay ${fmtNumber(l.authorizedQuota)} autorizadas${l.pendingQuantity > 0 ? ` y ${fmtNumber(l.pendingQuantity)} pedidas` : ""}`
      : "";
  const summary =
    l.maxQuantity > 0
      ? `Puedes autorizar hasta ${fmtNumber(l.maxQuantity)} ${l.maxQuantity === 1 ? "botella" : "botellas"}: ${source}${already}.`
      : `No queda cuota por autorizar: ${source}${already}.`;
  return {
    basis: byBottles ? "botellas" : "estimación",
    basisText: byBottles
      ? "Botellas embotelladas con código activo (el lote ya está embotellado)"
      : "Estimación de botellas declarada por la bodega (el lote aún no está embotellado)",
    limit,
    authorized: l.authorizedQuota,
    pending: l.pendingQuantity,
    max: l.maxQuantity,
    summary,
  };
}

// ---------------------------------------------------------------------------
// Formulario
// ---------------------------------------------------------------------------

export type FormImage = { key: string; alt: string; isCover: boolean };

export type TokenizationFormValues = {
  quantity: string;
  name: string;
  description: string;
  tastingNotes: string;
  pairing: string;
  images: FormImage[];
  notes: string;
};

export type TokenizationFormField = keyof TokenizationFormValues;
export type TokenizationFormErrors = Partial<Record<TokenizationFormField, string>>;

export const MAX_IMAGES = 8;

export function emptyTokenizationForm(overrides: Partial<TokenizationFormValues> = {}): TokenizationFormValues {
  return {
    quantity: "",
    name: "",
    description: "",
    tastingNotes: "",
    pairing: "",
    images: [],
    notes: "",
    ...overrides,
  };
}

/** Formulario con lo que ya tiene la solicitud (para editarla con cambios pedidos). */
export function formFromRequest(
  r: Pick<TokenizationRequest, "quantity" | "commercialDraft" | "wineryNotes">,
): TokenizationFormValues {
  const d = r.commercialDraft;
  return {
    quantity: fmtNumber(r.quantity),
    name: d.name ?? "",
    description: d.description ?? "",
    tastingNotes: d.tastingNotes ?? "",
    pairing: d.pairing ?? "",
    images: withSingleCover(d.imageKeys.map((i) => ({ key: i.key, alt: i.alt, isCover: i.isCover ?? false }))),
    notes: r.wineryNotes ?? "",
  };
}

/** Exactamente una portada: la marcada o, si no hay ninguna (o hay varias), la primera de ellas. */
export function withSingleCover(images: readonly FormImage[]): FormImage[] {
  const cover = Math.max(
    0,
    images.findIndex((i) => i.isCover),
  );
  return images.map((image, index) => ({ ...image, isCover: index === cover }));
}

export const addImage = (images: readonly FormImage[], key: string): FormImage[] =>
  withSingleCover([...images, { key, alt: "", isCover: false }]);

export const removeImage = (images: readonly FormImage[], key: string): FormImage[] =>
  withSingleCover(images.filter((i) => i.key !== key));

export const setCover = (images: readonly FormImage[], key: string): FormImage[] =>
  images.map((i) => ({ ...i, isCover: i.key === key }));

export const setAlt = (images: readonly FormImage[], key: string, alt: string): FormImage[] =>
  images.map((i) => (i.key === key ? { ...i, alt } : i));

type Validated = { quantity: number; commercial: NonNullable<CreateTokenizationRequest["commercial"]>; notes?: string };
type ValidationResult = { ok: true; value: Validated } | { ok: false; errors: TokenizationFormErrors };

/**
 * Valida la forma de lo que se envía (§5.5): cantidad entera, longitudes y una descripción por
 * foto. Que la cantidad quepa en la cuota lo decide el servidor (`TOK_QUOTA_EXCEEDS_…`).
 * `commercial: false` en una ampliación: la colección ya tiene sus datos comerciales.
 */
export function validateTokenizationForm(
  v: TokenizationFormValues,
  options: { commercial: boolean },
): ValidationResult {
  const errors: TokenizationFormErrors = {};
  const quantity = parseDecimal(v.quantity);
  if (!v.quantity.trim()) errors.quantity = "Indica cuántas botellas quieres autorizar.";
  else if (quantity == null || !Number.isInteger(quantity) || quantity < 1) {
    errors.quantity = "Indica un número entero de botellas, a partir de 1.";
  }

  const name = v.name.trim();
  const description = v.description.trim();
  const tastingNotes = v.tastingNotes.trim();
  const pairing = v.pairing.trim();
  const notes = v.notes.trim();

  if (options.commercial) {
    if (name.length < 3) errors.name = "Escribe un nombre de al menos 3 caracteres.";
    else if (name.length > 120) errors.name = "El nombre admite hasta 120 caracteres.";
    if (description.length < 20) errors.description = "Describe la colección con al menos 20 caracteres.";
    else if (description.length > 4000) errors.description = "La descripción admite hasta 4.000 caracteres.";
    if (tastingNotes.length > 2000) errors.tastingNotes = "Las notas de cata admiten hasta 2.000 caracteres.";
    if (pairing.length > 1000) errors.pairing = "El maridaje admite hasta 1.000 caracteres.";
    if (v.images.length > MAX_IMAGES) errors.images = `Puedes subir hasta ${MAX_IMAGES} fotos.`;
    else if (v.images.some((i) => !i.alt.trim()))
      errors.images = "Describe cada foto: es el texto que leen los lectores de pantalla.";
    else if (v.images.some((i) => i.alt.trim().length > 300))
      errors.images = "La descripción de cada foto admite hasta 300 caracteres.";
  }
  if (notes.length > 2000) errors.notes = "Las notas admiten hasta 2.000 caracteres.";
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const imageKeys: CollectionImageInput[] = withSingleCover(v.images).map((i) => ({
    key: i.key,
    alt: i.alt.trim(),
    isCover: i.isCover,
  }));
  return {
    ok: true,
    value: {
      quantity: quantity!,
      commercial: options.commercial
        ? { name, description, tastingNotes: tastingNotes || null, pairing: pairing || null, imageKeys }
        : {},
      ...(notes ? { notes } : {}),
    },
  };
}

/** Cuerpo de `POST /v1/lots/{id}/tokenization-requests` (la confirmación explícita va en `confirm`). */
export function toCreateBody(value: Validated, options: { commercial: boolean }): CreateTokenizationRequest {
  return {
    quantity: value.quantity,
    ...(options.commercial ? { commercial: value.commercial } : {}),
    ...(value.notes ? { notes: value.notes } : {}),
    confirm: true,
  };
}

/** Cuerpo de `PATCH /v1/tokenization-requests/{id}`. */
export function toUpdateBody(value: Validated, options: { commercial: boolean }): UpdateTokenizationRequest {
  return {
    quantity: value.quantity,
    ...(options.commercial ? { commercial: value.commercial } : {}),
    ...(value.notes ? { notes: value.notes } : {}),
  };
}

const API_FIELD: Record<string, TokenizationFormField> = {
  quantity: "quantity",
  notes: "notes",
  "commercial.name": "name",
  "commercial.description": "description",
  "commercial.tastingNotes": "tastingNotes",
  "commercial.pairing": "pairing",
  "commercial.imageKeys": "images",
};

/** `details[].field` de un 422 → campos del formulario (`commercial.imageKeys.0.alt` → fotos). */
export function tokenizationFieldErrors(error: unknown): TokenizationFormErrors {
  return fieldErrorsFrom<TokenizationFormField>(error, (field) => {
    if (API_FIELD[field]) return API_FIELD[field];
    return field.startsWith("commercial.imageKeys") ? "images" : undefined;
  }).fieldErrors;
}

export const TOKENIZATION_FORM_FIELDS: readonly string[] = [...Object.keys(API_FIELD), "confirm"];

/** «Se emitirán 100 NFT a nombre de tu bodega en la red Stellar cuando Drinks on Chain apruebe la solicitud.» */
export function confirmationText(quantity: number, approvalRequired: boolean): string {
  const nft = `${fmtNumber(quantity)} NFT`;
  return approvalRequired
    ? `Se emitirán ${nft} a nombre de tu bodega en la red Stellar cuando Drinks on Chain apruebe la solicitud.`
    : `Se emitirán ${nft} a nombre de tu bodega en la red Stellar en cuanto envíes la solicitud.`;
}

// ---------------------------------------------------------------------------
// Cierre con faltante (solo lectura)
// ---------------------------------------------------------------------------

export const CLOSURE_STATUS: Record<WineryLotClosure["status"], Label> = {
  NO_SHORTFALL: { label: "Sin faltante", tone: "success" },
  SHORTFALL_OPEN: { label: "Faltante por resolver", tone: "warning" },
  DECIDED: { label: "Faltante decidido", tone: "info" },
  RESOLVED: { label: "Resuelto", tone: "success" },
};

export const CLOSURE_OUTCOME: Record<WineryLotClosure["items"][number]["outcome"], string> = {
  BURN_UNSOLD: "Se quema (sin vender)",
  MANUAL_REFUND: "Devolución al comprador",
  MANUAL_SUBSTITUTE: "Sustitución por otra botella",
  PENDING: "Pendiente de resolver",
};

/** Qué pasó al comparar los NFT con las botellas reales, dicho para la bodega. */
export function closureSummary(c: Pick<WineryLotClosure, "status" | "shortfall" | "bottles" | "minted">): string {
  if (c.shortfall === 0) {
    return `Hay botella para cada NFT: ${fmtNumber(c.bottles)} botellas para ${fmtNumber(c.minted)} NFT emitidos.`;
  }
  const missing = `${fmtNumber(c.shortfall)} ${c.shortfall === 1 ? "NFT se quedó" : "NFT se quedaron"} sin botella`;
  const counts = `(${fmtNumber(c.minted)} emitidos, ${fmtNumber(c.bottles)} botellas)`;
  switch (c.status) {
    case "SHORTFALL_OPEN":
      return `${missing} ${counts}. Drinks on Chain decide cómo resolverlo; la bodega no tiene que hacer nada aquí.`;
    case "DECIDED":
      return `${missing} ${counts}. Drinks on Chain ya decidió y lo está resolviendo.`;
    default:
      return `${missing} ${counts}. Quedó resuelto.`;
  }
}
