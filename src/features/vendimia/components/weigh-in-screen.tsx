"use client";

import Link from "next/link";
import { Button, EmptyState, Skeleton } from "@drinks-on-chain/ui";
import { PageChrome } from "@/components/page-chrome";
import { useMe } from "@/lib/auth/hooks";
import { can } from "@/lib/erp/permissions";
import { WeighInForm } from "./weigh-in-form";

/** Pantalla de pesaje con migas y control de rol (harvest.create). */
export function WeighInScreen({ initialTerroirId }: { initialTerroirId?: string }) {
  const me = useMe();
  return (
    <div className="grid gap-6">
      <PageChrome
        breadcrumbs={[{ label: "Vendimia y laboratorio", href: "/vendimia" }, { label: "Registrar ingreso" }]}
      />
      <header className="grid gap-1">
        <h1 className="font-display text-3xl">Registrar ingreso</h1>
        <p className="m-0 text-sm text-fg-muted">Pesaje y análisis preliminar de la uva que llega a la bodega.</p>
      </header>
      {!me.data ? (
        <Skeleton shape="block" className="h-96" />
      ) : !can(me.data, "harvest.create") ? (
        <EmptyState
          title="Sin permiso para registrar ingresos"
          description="El pesaje lo registran administración, agronomía o enología."
          action={
            <Button asChild variant="secondary">
              <Link href="/vendimia">Volver a vendimia</Link>
            </Button>
          }
        />
      ) : (
        <WeighInForm initialTerroirId={initialTerroirId} />
      )}
    </div>
  );
}
