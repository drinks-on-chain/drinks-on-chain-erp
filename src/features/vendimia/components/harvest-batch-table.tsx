"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import type { HarvestBatchResponse } from "@drinks-on-chain/mocks";
import { DataTable, Tag, cn, type DataTableColumn } from "@drinks-on-chain/ui";
import { fmtDate, fmtNumber } from "@/lib/format";
import { harvestReadings, readingState } from "../lab-targets";
import { PhytoBadge } from "./phyto-badge";

/** Brix · pH · acidez en una celda; las lecturas fuera de objetivo en ámbar. Sin análisis, lo dice. */
export function LabSummary({ batch }: { batch: HarvestBatchResponse }) {
  if (batch.brixDegrees == null && batch.initialPh == null && batch.initialAcidityGl == null) {
    return <span className="text-fg-muted">Sin análisis</span>;
  }
  return (
    <span className="inline-flex gap-1.5 whitespace-nowrap tabular-nums">
      {harvestReadings(batch).map(({ target, value }, i) => {
        const state = readingState(value, target);
        const out = state === "low" || state === "high";
        return (
          <span key={target.key} className="inline-flex gap-1.5">
            {i > 0 && (
              <span aria-hidden className="text-fg-subtle">
                ·
              </span>
            )}
            <span
              title={`${target.label}${out ? " fuera de objetivo" : ""}`}
              className={cn(out && "rounded-sm bg-warning-soft px-1 font-medium")}
            >
              <span className="sr-only">{target.label} </span>
              {value == null ? "—" : fmtNumber(value, target.digits)}
            </span>
          </span>
        );
      })}
    </span>
  );
}

export type HarvestBatchTableProps = {
  data: HarvestBatchResponse[];
  loading?: boolean;
  /** Nombre de la parcela por id; si se omite, no se muestra la columna (ficha del terroir). */
  parcelNames?: Map<string, string>;
  /** Nombre del lote por id; si se omite, no se muestra la columna. */
  lotNames?: Map<string, string>;
  empty: ReactNode;
  rowActions?: (h: HarvestBatchResponse) => ReactNode;
  caption?: string;
};

/** Tabla de lotes de vendimia: código, parcela, fecha, neto, laboratorio y estado. */
export function HarvestBatchTable({
  data,
  loading,
  parcelNames,
  lotNames,
  empty,
  rowActions,
  caption,
}: HarvestBatchTableProps) {
  const columns: DataTableColumn<HarvestBatchResponse>[] = [
    {
      id: "code",
      header: "Código",
      accessor: "harvestBatchCode",
      sortable: true,
      cell: (h) => (
        <Link href={`/vendimia/${h.id}`} className="font-medium whitespace-nowrap hover:underline">
          {h.harvestBatchCode}
        </Link>
      ),
    },
    ...(parcelNames
      ? [
          {
            id: "parcel",
            header: "Parcela",
            accessor: (h: HarvestBatchResponse) => parcelNames.get(h.terroirId) ?? "",
            sortable: true,
            hideBelow: "lg",
            cell: (h: HarvestBatchResponse) => parcelNames.get(h.terroirId) ?? "—",
          } satisfies DataTableColumn<HarvestBatchResponse>,
        ]
      : []),
    ...(lotNames
      ? [
          {
            id: "lot",
            header: "Lote",
            hideBelow: "lg",
            cell: (h: HarvestBatchResponse) =>
              h.lotId ? (
                <Link href={`/lotes/${h.lotId}`} className="hover:underline">
                  {lotNames.get(h.lotId) ?? "Ver lote"}
                </Link>
              ) : (
                <Tag>Sin lote</Tag>
              ),
          } satisfies DataTableColumn<HarvestBatchResponse>,
        ]
      : []),
    {
      id: "date",
      header: "Ingreso",
      accessor: "intakeDate",
      sortable: true,
      cell: (h) => <span className="whitespace-nowrap">{fmtDate(h.intakeDate)}</span>,
    },
    {
      id: "net",
      header: "Neto (kg)",
      accessor: "netWeightKg",
      sortable: true,
      numeric: true,
      cell: (h) => fmtNumber(h.netWeightKg),
    },
    {
      id: "lab",
      header: "Brix · pH · acidez",
      hideBelow: "md",
      cell: (h) => <LabSummary batch={h} />,
    },
    {
      id: "status",
      header: "Estado",
      accessor: "phytosanitaryStatus",
      sortable: true,
      cell: (h) => <PhytoBadge status={h.phytosanitaryStatus} />,
    },
  ];

  return (
    <DataTable
      data={data}
      columns={columns}
      loading={loading}
      getRowId={(h) => h.id}
      rowActions={rowActions}
      empty={empty}
      caption={caption}
      captionHidden={!!caption}
    />
  );
}
