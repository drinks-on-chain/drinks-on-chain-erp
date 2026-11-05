import { Badge } from "@drinks-on-chain/ui";

/**
 * Anclaje del lote de un embotellado (campo legado `isAnchoredOnChain`, real desde la Ola 3): la
 * huella del expediente se publica en la red al cerrarlo. El detalle, en el expediente del lote.
 */
export function AnchorBadge({ anchored }: { anchored: boolean }) {
  return anchored ? <Badge tone="success">Anclado en la red</Badge> : <Badge tone="neutral">Sin anclar</Badge>;
}
