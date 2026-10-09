import type {
  ChainIdentityStatus,
  ChainNetwork,
  ChainTxKind,
  ChainTxRef,
  Collection,
  CollectionStatus,
  DossierAnchor,
  MintStatus,
  TokenCounts,
  WineryChainAccountView,
} from "@drinks-on-chain/mocks";
import { isTxInProgress, type Tone } from "@drinks-on-chain/ui";

// Cadena (contrato de la Ola 3 §2.4, §3.4, §6 y §7): textos de los estados y cuándo hay algo en
// vuelo. El ERP no consulta la red: lee los `ChainTxRef` que el backend incrusta en la cuenta de la
// bodega, la colección y el anclaje, y los refresca por consulta mientras alguno siga en curso.

/** Cada cuánto se vuelve a consultar mientras haya transacciones en curso (§2.4). */
export const CHAIN_POLL_MS = 5_000;

type Label = { label: string; tone: Tone };

export const CHAIN_NETWORK: Record<ChainNetwork, string> = {
  TESTNET: "Red de pruebas de Stellar (testnet)",
  PUBLIC: "Red principal de Stellar",
  LOCAL: "Red local de pruebas",
};

export const CHAIN_IDENTITY_STATUS: Record<ChainIdentityStatus, Label> = {
  NOT_PROVISIONED: { label: "Sin cuenta en la red", tone: "neutral" },
  PROVISIONING: { label: "Preparando la cuenta", tone: "info" },
  ACTIVE: { label: "Activa", tone: "success" },
  FAILED: { label: "No se pudo preparar", tone: "danger" },
  PAUSED: { label: "Pausada en la red", tone: "warning" },
};

export const CHAIN_TX_KIND: Record<ChainTxKind, string> = {
  CREATE_WINERY_ACCOUNT: "Creación de la cuenta",
  DEPLOY_WINERY_CONTRACT: "Despliegue del contrato NFT",
  SET_TOKEN_URI_BASE: "Dirección de los metadatos",
  MINT_BATCH: "Emisión de NFT",
  ANCHOR_DOSSIER: "Anclaje de un expediente",
  PAUSE_CONTRACT: "Pausa del contrato",
  UNPAUSE_CONTRACT: "Reanudación del contrato",
  BURN_UNSOLD: "Quema de NFT sin vender",
  EXTEND_TTL: "Mantenimiento del almacenamiento",
  RESTORE_ENTRIES: "Restauración del almacenamiento",
  FUND_ACCOUNT: "Recarga de la cuenta (pruebas)",
  OPERATOR_TRANSFER: "Entrega de un NFT",
  REDEEM_BURN: "Quema por canje",
};

/** Tipo de transacción; uno que el backend añada después se muestra tal cual. */
export const txKindLabel = (kind: string): string => (CHAIN_TX_KIND as Record<string, string>)[kind] ?? kind;

export const COLLECTION_STATUS: Record<CollectionStatus, Label> = {
  MINTING: { label: "Emitiendo", tone: "info" },
  READY: { label: "Emitida, sin publicar", tone: "neutral" },
  PUBLISHED: { label: "Publicada", tone: "success" },
  PAUSED: { label: "Pausada", tone: "warning" },
  CLOSED: { label: "Cerrada", tone: "neutral" },
};

export const MINT_STATUS: Record<MintStatus, Label> = {
  PENDING: { label: "En cola", tone: "info" },
  IN_PROGRESS: { label: "En curso", tone: "info" },
  CONFIRMED: { label: "Confirmada", tone: "success" },
  FAILED: { label: "Fallida", tone: "danger" },
};

export const ANCHOR_STATUS: Record<DossierAnchor["status"], Label> = {
  PENDING: { label: "Anclaje pendiente", tone: "warning" },
  SUBMITTED: { label: "Anclaje enviado a la red", tone: "info" },
  ANCHORED: { label: "Anclado en la red", tone: "success" },
  FAILED: { label: "Anclaje fallido", tone: "danger" },
};

type TxLike = Pick<ChainTxRef, "status"> & Partial<Pick<ChainTxRef, "lastError">>;

/**
 * Motivos por los que una emisión espera en `PENDING` sin fallar (mocks `CONTRATO.md` §14.2): la
 * emisión aún no está habilitada en la plataforma (ADR-011) o la bodega no está activa. Continúa
 * sola cuando desaparece la causa.
 */
export const MINT_HOLD: Record<string, { title: string; text: string }> = {
  CHN_MINT_DISABLED: {
    title: "Emisión en espera",
    text: "La solicitud está aprobada, pero Drinks on Chain aún no tiene habilitada la emisión en la red. Los NFT se emitirán solos en cuanto la habilite; no tienes que hacer nada.",
  },
  CHN_WINERY_NOT_ACTIVE: {
    title: "Emisión en espera",
    text: "La solicitud está aprobada, pero la emisión espera a que la bodega vuelva a estar activa. Continuará sola en cuanto Drinks on Chain la reactive.",
  },
};

/** La transacción está en cola a la espera de una causa externa (no avanza ni ha fallado). */
export const txOnHold = (tx: TxLike): boolean =>
  tx.status === "PENDING" && !!tx.lastError && tx.lastError.code in MINT_HOLD;

/** Motivo de espera de la emisión de una colección, o `null`. */
export function mintHoldOf(c: { mints: readonly { transactions: readonly TxLike[] }[] }) {
  for (const mint of c.mints) {
    const held = mint.transactions.find(txOnHold);
    if (held?.lastError) return MINT_HOLD[held.lastError.code] ?? null;
  }
  return null;
}

/**
 * Alguna transacción sigue de `PENDING` a `RETRYING` y avanzando. Una emisión en espera no cuenta:
 * puede tardar días, así que no se consulta cada 5 s (la persona usa «Actualizar»).
 */
export const anyTxInProgress = (txs: readonly TxLike[]): boolean =>
  txs.some((t) => isTxInProgress(t.status) && !txOnHold(t));

/**
 * El backend aún no tiene la ruta (404) o la declara sin implementar (501): pasa mientras no
 * despliegue la Ola 3. No es un error de la persona ni se arregla reintentando.
 */
export const isRouteMissing = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "status" in error &&
  ((error as { status: unknown }).status === 404 || (error as { status: unknown }).status === 501);

/** El anclaje aún no terminó (ni confirmado ni fallido). */
export const anchorInProgress = (anchor: Pick<DossierAnchor, "transaction"> | null | undefined): boolean =>
  !!anchor && isTxInProgress(anchor.transaction.status);

/** La cuenta de la bodega tiene algo en vuelo: identidad, emisiones o anclajes. */
export function chainAccountInProgress(view: WineryChainAccountView): boolean {
  return (
    view.identity.status === "PROVISIONING" ||
    anyTxInProgress(view.identity.pendingTransactions) ||
    anyTxInProgress(view.recentTransactions) ||
    view.byLot.some((l) => anchorInProgress(l.anchor))
  );
}

/** La colección tiene una emisión o un anclaje sin terminar. */
export function collectionInProgress(c: Pick<Collection, "mints" | "anchor" | "closure">): boolean {
  return (
    c.mints.some((m) => anyTxInProgress(m.transactions)) ||
    anchorInProgress(c.anchor) ||
    (c.closure?.items ?? []).some((i) => i.burnTx != null && isTxInProgress(i.burnTx.status))
  );
}

/**
 * NFT que ya salieron de la bodega: vendidos y los estados que les siguen (canjeable, con pase,
 * canjeado, vencido). Es una suma para mostrar; cada cifra la calcula el servidor.
 */
export const soldCount = (c: TokenCounts): number => c.sold + c.redeemable + c.passActive + c.redeemed + c.expired;

/** "0.1389000" (XLM con 7 decimales, del backend) → "0,1389 XLM": sin ceros de relleno. */
export function fmtXlm(amount: string): string {
  const [whole = "0", decimals = ""] = amount.trim().split(".");
  const trimmed = decimals.replace(/0+$/, "");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${grouped}${trimmed ? `,${trimmed}` : ""} XLM`;
}
