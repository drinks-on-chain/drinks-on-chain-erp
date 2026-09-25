import type { PhytosanitaryStatus } from "@drinks-on-chain/mocks";
import { Badge } from "@drinks-on-chain/ui";
import { PHYTO_STATUS } from "@/lib/erp/labels";

/** Estado fitosanitario del lote de vendimia con su tono (verde aprobado, rojo rechazo, ámbar espera). */
export function PhytoBadge({ status, strong }: { status: PhytosanitaryStatus; strong?: boolean }) {
  const { label, tone } = PHYTO_STATUS[status];
  return (
    <Badge tone={tone} variant={strong ? "strong" : "soft"}>
      {label}
    </Badge>
  );
}
