"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FlaskConical, Plus } from "lucide-react";
import { Badge, Button, Card, DataTable, EmptyState, ErrorState, Progress } from "@drinks-on-chain/ui";
import { PageChrome } from "@/components/page-chrome";
import {
  buildProductionRows,
  restAllowsBottling,
  restProgress,
  type ProductionRowModel,
} from "@/features/destilacion/distillation-model";
import { lotLookup } from "@/features/vinificacion/tank-model";
import { errorMessage } from "@/lib/api/errors";
import { useMe } from "@/lib/auth/hooks";
import { useHarvestBatches, useProductions, useTanks, useTerroirs } from "@/lib/erp/hooks";
import { REST_STATUS } from "@/lib/erp/labels";
import { can } from "@/lib/erp/permissions";
import { today } from "@/lib/erp/today";
import { fmtDate, fmtLiters, fmtNumber } from "@/lib/format";

function RestCell({ row }: { row: ProductionRowModel }) {
  const { rest } = row;
  if (rest.restStatus === "BOTTLED" || rest.restStatus === "DISCARDED" || rest.restStatus === "NOT_REQUIRED")
    return <span className="text-sm text-fg-subtle">—</span>;
  const ready = restAllowsBottling(rest);
  return (
    <div className="flex items-center gap-2">
      <Progress
        value={restProgress(rest)}
        tone={ready ? "success" : "warning"}
        className="w-24 lg:w-32"
        label={`Reposo de ${row.lotName}`}
        valueText={ready ? "Reposo cumplido" : `${rest.daysRemaining} días restantes`}
      />
      <span className="text-sm whitespace-nowrap tabular-nums">
        {ready ? "Cumplido" : `${fmtNumber(rest.daysRemaining)} d`}
      </span>
    </div>
  );
}

export default function DestilacionPage() {
  const router = useRouter();
  const me = useMe();
  const productions = useProductions();
  const tanks = useTanks();
  const harvest = useHarvestBatches();
  const terroirs = useTerroirs();

  const rows = useMemo(() => {
    if (!productions.data || !tanks.data || !harvest.data || !terroirs.data) return undefined;
    return buildProductionRows({
      productions: productions.data.items,
      tanks: tanks.data.items,
      lookup: lotLookup(harvest.data.items, terroirs.data.items),
      today: today(),
    });
  }, [productions.data, tanks.data, harvest.data, terroirs.data]);

  const queries = [productions, tanks, harvest, terroirs];
  const failed = queries.find((q) => q.isError);
  const create = can(me.data, "distillation.create") ? (
    <Button asChild iconStart={<Plus aria-hidden size={18} />}>
      <Link href="/destilacion/nueva">Registrar destilación</Link>
    </Button>
  ) : null;

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageChrome breadcrumbs={[{ label: "Destilación y reposo" }]} actions={create} />
      <div>
        <h1 className="font-display text-3xl">Destilación y reposo</h1>
        <p className="m-0 text-fg-muted">
          El singani D.O. reposa 180 días desde el fin de la destilación antes de poder embotellarse.
        </p>
      </div>

      {failed ? (
        <ErrorState
          description={errorMessage(failed.error)}
          onRetry={() => queries.forEach((q) => q.refetch())}
          retrying={queries.some((q) => q.isFetching)}
        />
      ) : (
        <Card>
          <DataTable
            data={rows ?? []}
            loading={!rows}
            getRowId={(r) => r.id}
            caption="Destilaciones"
            captionHidden
            onRowClick={(r) => router.push(`/destilacion/${r.id}`)}
            columns={[
              {
                id: "lot",
                header: "Lote",
                cell: (r) => (
                  <div className="grid">
                    <Link href={`/destilacion/${r.id}`} className="font-medium hover:underline">
                      {r.lotName}
                    </Link>
                    <span className="flex items-center gap-2 text-xs text-fg-subtle">
                      {r.tankCode}
                      {r.isDoEligible && (
                        <Badge tone="accent" dot={false}>
                          D.O.
                        </Badge>
                      )}
                    </span>
                  </div>
                ),
              },
              { id: "still", header: "Alambique", hideBelow: "md", cell: (r) => r.equipment },
              { id: "end", header: "Destilado", hideBelow: "lg", cell: (r) => fmtDate(r.endDate) },
              {
                id: "heart",
                header: "Corazón",
                numeric: true,
                cell: (r) => (r.heartLiters !== null ? fmtLiters(r.heartLiters) : "—"),
              },
              {
                id: "abv",
                header: "Grado",
                numeric: true,
                hideBelow: "xl",
                cell: (r) => (r.initialAlcohol !== null ? `${fmtNumber(r.initialAlcohol, 1)} %` : "—"),
              },
              { id: "rest", header: "Reposo", cell: (r) => <RestCell row={r} /> },
              {
                id: "status",
                header: "Estado",
                cell: (r) => {
                  const s =
                    r.rest.restStatus === "RESTING" && r.rest.isRestCompleted
                      ? REST_STATUS.READY
                      : REST_STATUS[r.rest.restStatus];
                  return <Badge tone={s.tone}>{s.label}</Badge>;
                },
              },
            ]}
            empty={
              <EmptyState
                bare
                icon={<FlaskConical aria-hidden size={32} strokeWidth={1.25} />}
                title="Ninguna destilación todavía"
                description="Cuando un tanque con destino destilación termine de fermentar, registra aquí sus cortes."
                action={create}
              />
            }
          />
        </Card>
      )}
    </div>
  );
}
