"use client";

import Link from "next/link";
import { Button, EmptyState, Skeleton } from "@drinks-on-chain/ui";
import { PageChrome } from "@/components/page-chrome";
import { TerroirForm } from "@/features/origen/components/terroir-form";
import { EMPTY_TERROIR } from "@/features/origen/terroir-form-values";
import { useMe } from "@/lib/auth/hooks";
import { can } from "@/lib/erp/permissions";

// Alta de terroir (09 §3): POST /v1/terroirs, certificado vía uploads?folder=certificates.
export default function NewTerroirPage() {
  const me = useMe();
  return (
    <div className="grid max-w-4xl gap-6">
      <PageChrome breadcrumbs={[{ label: "Origen y terroirs", href: "/origen" }, { label: "Nuevo terroir" }]} />
      <h1 className="font-display text-3xl">Nuevo terroir</h1>
      {!me.data ? (
        <Skeleton shape="block" className="h-96" />
      ) : !can(me.data, "terroir.write") ? (
        <EmptyState
          title="Sin permiso para registrar terroirs"
          description="Solo la administración de la bodega y agronomía pueden dar de alta parcelas."
          action={
            <Button asChild variant="secondary">
              <Link href="/origen">Volver al directorio</Link>
            </Button>
          }
        />
      ) : (
        <TerroirForm mode="create" initial={EMPTY_TERROIR} />
      )}
    </div>
  );
}
