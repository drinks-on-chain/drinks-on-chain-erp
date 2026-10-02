import { Badge } from "@drinks-on-chain/ui";
import { RULE_SOURCE, type RuleItem } from "../lot-model";

/** Reglas del lote (instantánea o valores vigentes): parámetro, valor, origen y excepción legal. */
export function RulesList({ items, label }: { items: RuleItem[]; label: string }) {
  return (
    <dl aria-label={label} className="m-0 grid gap-3">
      {items.map((item) => (
        <div key={item.key} className="grid gap-0.5 border-b border-border pb-3 last:border-b-0 last:pb-0">
          <dt className="text-sm text-fg-muted">{item.label}</dt>
          <dd className="m-0 flex flex-wrap items-center gap-2">
            <span className="font-medium tabular-nums">{item.value}</span>
            {item.legalException && (
              <Badge tone="warning" title="Valor por debajo del mínimo legal, autorizado por administración">
                Excepción legal
              </Badge>
            )}
            {item.source && <span className="text-xs text-fg-subtle">{RULE_SOURCE[item.source]}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}
