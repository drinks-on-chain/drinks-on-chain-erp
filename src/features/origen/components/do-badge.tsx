import { Check } from "lucide-react";
import { Badge, Tag } from "@drinks-on-chain/ui";
import { doBadgeText, doEligibility, doReasonText, type DoInput } from "../do-eligibility";

/**
 * Aptitud D.O. Singani (05 §3.3). Oro fuerte si cumple; ámbar con el motivo si es Moscatel
 * y no cumple; etiqueta neutra "Vino" si la cepa no es de singani (01-erp §04).
 * `explain` fuerza el ámbar con motivo también para otras cepas (vista previa del formulario).
 */
export function DoBadge({ explain = false, className, ...input }: DoInput & { explain?: boolean; className?: string }) {
  const result = doEligibility(input);
  if (result.eligible) {
    return (
      <Badge tone="accent" variant="strong" dot={false} className={className}>
        <Check aria-hidden size={14} strokeWidth={2} />
        {doBadgeText(result)}
      </Badge>
    );
  }
  if (!result.applicable && !explain) {
    return (
      <Tag className={className} title={`No aplica a la D.O. Singani: ${doReasonText("variety")}`}>
        Vino
      </Tag>
    );
  }
  return (
    <Badge tone="warning" className={className}>
      {doBadgeText(result)}
    </Badge>
  );
}
