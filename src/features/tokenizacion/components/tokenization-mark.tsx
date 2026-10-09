import type { LotTokenizationMark } from "@drinks-on-chain/mocks";
import { Badge } from "@drinks-on-chain/ui";
import { markView } from "../tokenization-model";

/**
 * Marca de tokenización del lote en la lista (contrato de la Ola 3 §5.3): no es una etapa. La ven
 * todos los roles; sin solicitud ni colección, una raya.
 */
export function TokenizationMark({ mark }: { mark: LotTokenizationMark }) {
  const view = markView(mark);
  if (!view) return <span className="text-fg-muted">—</span>;
  return (
    <span className="grid justify-items-start gap-1">
      <Badge tone={view.tone}>{view.label}</Badge>
      {view.detail && <span className="text-xs whitespace-nowrap text-fg-muted">{view.detail}</span>}
    </span>
  );
}
