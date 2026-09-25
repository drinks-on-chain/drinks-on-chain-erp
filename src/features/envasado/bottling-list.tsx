"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import type { BottlingBatchResponse } from "@drinks-on-chain/mocks";
import { Badge, Button, DataTable, EmptyState, ErrorState, Skeleton } from "@drinks-on-chain/ui";
import { PageChrome } from "@/components/page-chrome";
import { errorMessage } from "@/lib/api/errors";
import { useMe } from "@/lib/auth/hooks";
import { useBottlings, useLabAnalysesOf } from "@/lib/erp/hooks";
import { PRODUCT_TYPE } from "@/lib/erp/labels";
import { can } from "@/lib/erp/permissions";
import { fmtDate, fmtNumber } from "@/lib/format";
import { AnchorBadge } from "./anchor-badge";

const abv = (n: number) => `${fmtNumber(n, Number.isInteger(n) ? 0 : 1)} % vol`;

export function BottlingList() {
  const me = useMe();
  const bottlings = useBottlings();
  const items = [...(bottlings.data?.items ?? [])].sort((a, b) => b.bottlingDate.localeCompare(a.bottlingDate));
  const labs = useLabAnalysesOf(items.map((b) => b.id));
  const canCreate = can(me.data, "bottling.create");

  const newAction = canCreate ? (
    <Button asChild iconStart={<Plus aria-hidden size={18} />}>
      <Link href="/envasado/nuevo">Nuevo embotellado</Link>
    </Button>
  ) : undefined;

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageChrome breadcrumbs={[{ label: "Envasado y QR" }]} actions={newAction} />
      <header className="grid grid-cols-1 gap-1">
        <h1 className="font-display text-3xl">Envasado y QR</h1>
        <p className="text-fg-muted">
          Cada embotellado cierra la producción de un lote, genera su código internacional y la huella que se ancla en
          Stellar.
        </p>
      </header>

      {bottlings.isError ? (
        <ErrorState
          description={errorMessage(bottlings.error)}
          onRetry={() => bottlings.refetch()}
          retrying={bottlings.isFetching}
        />
      ) : (
        <DataTable<BottlingBatchResponse>
          caption="Embotellados de la bodega"
          captionHidden
          data={items}
          loading={bottlings.isPending}
          getRowId={(b) => b.id}
          defaultSort={{ columnId: "date", direction: "desc" }}
          columns={[
            {
              id: "lot",
              header: "Código de lote",
              accessor: "internationalLotCode",
              sortable: true,
              cell: (b) => (
                <Link href={`/envasado/${b.id}`} className="font-mono text-sm font-medium hover:underline">
                  {b.internationalLotCode}
                </Link>
              ),
            },
            { id: "product", header: "Producto", cell: (b) => PRODUCT_TYPE[b.productType], hideBelow: "md" },
            {
              id: "bottles",
              header: "Botellas",
              accessor: "totalBottlesPackaged",
              numeric: true,
              sortable: true,
              cell: (b) => fmtNumber(b.totalBottlesPackaged),
            },
            {
              id: "format",
              header: "Formato y grado",
              cell: (b) => `${fmtNumber(b.packagingFormatCl)} cl · ${abv(b.finalAlcoholAbv)}`,
              hideBelow: "lg",
            },
            {
              id: "date",
              header: "Fecha",
              accessor: "bottlingDate",
              sortable: true,
              cell: (b) => fmtDate(b.bottlingDate),
            },
            { id: "chain", header: "Cadena", cell: (b) => <AnchorBadge anchored={b.isAnchoredOnChain} /> },
            {
              id: "lab",
              header: "Certificado",
              hideBelow: "md",
              cell: (b) => {
                const q = labs.get(b.id);
                if (!q || q.isPending) return <Skeleton className="h-5 w-16" />;
                if (q.isError) return <span className="text-fg-subtle">—</span>;
                return q.data ? (
                  <Badge tone="success">Sí</Badge>
                ) : (
                  <Badge tone="neutral" dot={false}>
                    Sin certificado
                  </Badge>
                );
              },
            },
          ]}
          rowActions={(b) => (
            <Button asChild size="sm" variant="tertiary">
              <Link href={`/envasado/${b.id}`} aria-label={`Ver ${b.internationalLotCode}`}>
                Ver
              </Link>
            </Button>
          )}
          empty={
            <EmptyState
              bare
              title="Aún no hay embotellados"
              description="Cuando una crianza o un reposo lleguen a cero, podrás cerrar la producción aquí."
              action={newAction}
            />
          }
        />
      )}
    </div>
  );
}
