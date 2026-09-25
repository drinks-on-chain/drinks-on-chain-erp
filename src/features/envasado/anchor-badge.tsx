import { Badge } from "@drinks-on-chain/ui";

/** Estado del anclaje en Stellar de un embotellado. */
export function AnchorBadge({ anchored }: { anchored: boolean }) {
  return anchored ? <Badge tone="success">Sincronizado</Badge> : <Badge tone="warning">Pendiente de anclaje</Badge>;
}
