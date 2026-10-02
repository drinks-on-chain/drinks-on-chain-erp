import { Check } from "lucide-react";
import { Badge, Tag } from "@drinks-on-chain/ui";
import { doBadgeText, doCheckText, doStatus, failedChecks, isWineParcel, type DoSubject } from "../do-eligibility";

/**
 * Aptitud D.O. Singani calculada por el servidor (05 §3.3; contrato de la Ola 2 §3.1). Oro fuerte
 * si cumple; ámbar si cumple por una excepción legal o si es de la cepa y no cumple, con el
 * motivo; etiqueta neutra "Vino" si la parcela es de otra cepa (01-erp §04).
 * `explain` muestra el motivo también para otras cepas (ficha de la parcela).
 */
export function DoBadge({
  terroir,
  explain = false,
  className,
}: {
  terroir: DoSubject;
  explain?: boolean;
  className?: string;
}) {
  const status = doStatus(terroir);
  if (status === "ELIGIBLE") {
    return (
      <Badge tone="accent" variant="strong" dot={false} className={className}>
        <Check aria-hidden size={14} strokeWidth={2} />
        {doBadgeText(terroir)}
      </Badge>
    );
  }
  if (status === "ELIGIBLE_BY_EXCEPTION") {
    return (
      <Badge
        tone="warning"
        className={className}
        title="Cumple gracias a un valor de la bodega por debajo del mínimo legal, autorizado por administración"
      >
        {doBadgeText(terroir)}
      </Badge>
    );
  }
  if (isWineParcel(terroir) && !explain) {
    const variety = failedChecks(terroir).find((c) => c.rule === "VARIETY");
    return (
      <Tag className={className} title={variety ? `No aplica a la D.O. Singani: ${doCheckText(variety)}` : undefined}>
        Vino
      </Tag>
    );
  }
  return (
    <Badge tone="warning" className={className}>
      {doBadgeText(terroir)}
    </Badge>
  );
}
