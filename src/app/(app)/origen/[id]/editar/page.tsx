"use client";

import { use } from "react";
import Link from "next/link";
import { Button, EmptyState, ErrorState, Skeleton } from "@drinks-on-chain/ui";
import { PageChrome } from "@/components/page-chrome";
import { TerroirForm } from "@/features/origen/components/terroir-form";
import { terroirToValues } from "@/features/origen/terroir-form-values";
import { errorMessage } from "@/lib/api/errors";
import { useMe } from "@/lib/auth/hooks";
import { useTerroir } from "@/lib/erp/hooks";
import { can } from "@/lib/erp/permissions";

// Edición de terroir (09 §3): PATCH /v1/terroirs/:id.
export default function EditTerroirPage({ params }: PageProps<"/origen/[id]/editar">) {
  const { id } = use(params);
  const me = useMe();
  const terroir = useTerroir(id);
  const t = terroir.data;

  return (
    <div className="grid max-w-4xl gap-6">
      <PageChrome
        breadcrumbs={[
          { label: "Origen y terroirs", href: "/origen" },
          { label: t?.parcelName ?? "Terroir", href: `/origen/${id}` },
          { label: "Editar" },
        ]}
      />
      <h1 className="font-display text-3xl">Editar terroir</h1>
      {terroir.isError ? (
        <ErrorState
          description={errorMessage(terroir.error)}
          onRetry={() => terroir.refetch()}
          retrying={terroir.isFetching}
        />
      ) : !t || !me.data ? (
        <Skeleton shape="block" className="h-96" />
      ) : !can(me.data, "terroir.write") ? (
        <EmptyState
          title="Sin permiso para editar terroirs"
          description="Solo la administración de la bodega y agronomía pueden modificar parcelas."
          action={
            <Button asChild variant="secondary">
              <Link href={`/origen/${id}`}>Volver a la ficha</Link>
            </Button>
          }
        />
      ) : (
        <TerroirForm key={t.id} mode="edit" terroirId={id} initial={terroirToValues(t)} />
      )}
    </div>
  );
}
