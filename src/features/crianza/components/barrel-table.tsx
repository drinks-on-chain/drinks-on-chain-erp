"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Badge, DataTable, Progress, type DataTableColumn } from "@drinks-on-chain/ui";
import { AGING_STATUS } from "@/lib/erp/labels";
import { fmtDate, fmtLiters, fmtNumber } from "@/lib/format";
import type { BarrelRowModel } from "../aging-model";

/** Días restantes de la fila: "38 d", "Liberado". */
export function BarrelRemaining({ row }: { row: BarrelRowModel }) {
  const { lock } = row;
  if (row.status === "BOTTLED" || row.status === "DISCARDED") return <span className="text-sm text-fg-subtle">—</span>;
  return (
    <div className="flex items-center gap-2">
      <Progress
        value={lock.progress}
        tone={lock.released ? "success" : "warning"}
        className="w-24 lg:w-32"
        label={`Avance de la crianza de ${row.containerCode ?? row.lotName}`}
        valueText={lock.released ? "Liberado" : `${lock.daysRemaining} días restantes`}
      />
      <span className="text-sm whitespace-nowrap tabular-nums">
        {lock.released ? "Liberado" : `${fmtNumber(lock.daysRemaining)} d`}
      </span>
    </div>
  );
}

const columns: DataTableColumn<BarrelRowModel>[] = [
  {
    id: "lot",
    header: "Lote",
    cell: (r) => (
      <div className="grid">
        <Link href={`/crianza/${r.id}`} className="font-medium hover:underline">
          {r.lotName}
        </Link>
        <span className="text-xs text-fg-subtle">{[r.harvestBatchCode, r.tankCode].filter(Boolean).join(" · ")}</span>
      </div>
    ),
  },
  {
    id: "container",
    header: "Madera y recipiente",
    hideBelow: "md",
    cell: (r) => (
      <div className="grid">
        <span>{r.containerMaterial ?? r.containerType}</span>
        <span className="text-xs text-fg-subtle">
          {[r.containerType, r.containerCode, r.useCycle ? `uso ${r.useCycle}` : null].filter(Boolean).join(" · ")}
        </span>
      </div>
    ),
  },
  {
    id: "liters",
    header: "Litros",
    numeric: true,
    hideBelow: "lg",
    cell: (r) => (r.volumeLiters !== null ? fmtLiters(r.volumeLiters) : "—"),
  },
  { id: "months", header: "Meses", numeric: true, accessor: "plannedMonths", sortable: true },
  {
    id: "remaining",
    header: "Restante",
    sortable: true,
    sortFn: (a, b) => a.lock.daysRemaining - b.lock.daysRemaining,
    cell: (r) => <BarrelRemaining row={r} />,
  },
  {
    id: "unlock",
    header: "Liberación",
    hideBelow: "xl",
    cell: (r) => fmtDate(r.lock.unlockAt),
  },
  {
    id: "status",
    header: "Estado",
    cell: (r) => {
      const released = r.status === "AGING" && r.lock.released;
      const s = released ? AGING_STATUS.READY : AGING_STATUS[r.status];
      return <Badge tone={s.tone}>{s.label}</Badge>;
    },
  },
];

/**
 * Tabla de barricas (05 §3.3 BarrelRow, 01-erp.html §07): lote, madera, meses y cuenta
 * atrás hasta `lockUntilDate`. De solo lectura: el backend no tiene edición de crianzas.
 */
export function BarrelTable({
  rows,
  loading,
  empty,
}: {
  rows: BarrelRowModel[];
  loading?: boolean;
  empty?: ReactNode;
}) {
  const router = useRouter();
  return (
    <DataTable
      data={rows}
      columns={columns}
      getRowId={(r) => r.id}
      loading={loading}
      onRowClick={(r) => router.push(`/crianza/${r.id}`)}
      caption="Barricas y crianzas"
      captionHidden
      empty={empty}
    />
  );
}
