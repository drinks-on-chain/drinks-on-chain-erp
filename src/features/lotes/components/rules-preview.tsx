"use client";

import { useMemo } from "react";
import { Alert, Button, Card, CardHeader, Skeleton } from "@drinks-on-chain/ui";
import { errorMessage } from "@/lib/api/errors";
import { useEffectiveSettings } from "@/lib/erp/hooks";
import { effectiveRuleItems } from "../lot-model";
import { RulesList } from "./rules-list";

/**
 * Reglas vigentes de la bodega que quedarán fijadas en el lote al crearlo (CFG-06): la
 * instantánea la toma el servidor en ese momento y ya no cambia aunque cambie la configuración.
 */
export function RulesPreview({ className }: { className?: string }) {
  const settings = useEffectiveSettings();
  const items = useMemo(() => effectiveRuleItems(settings.data ?? []), [settings.data]);
  return (
    <Card className={className} aria-label="Reglas que se fijarán en el lote">
      <CardHeader
        title="Reglas que se fijarán"
        description="Al crear el lote, el servidor guarda estos valores como su instantánea de reglas. Un cambio posterior en la configuración solo afecta a los lotes nuevos."
        className="mb-4"
      />
      {settings.isError ? (
        <Alert
          tone="danger"
          title="No se pudieron cargar las reglas vigentes"
          action={
            <Button size="sm" variant="tertiary" onClick={() => settings.refetch()}>
              Reintentar
            </Button>
          }
        >
          {errorMessage(settings.error)} El lote se puede crear igual: las reglas se verán en su ficha.
        </Alert>
      ) : !settings.data ? (
        <Skeleton shape="block" className="h-56" />
      ) : (
        <RulesList items={items} label="Reglas vigentes de la bodega" />
      )}
    </Card>
  );
}
