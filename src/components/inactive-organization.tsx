"use client";

import Link from "next/link";
import { Ban, Clock, PauseCircle, ShieldAlert } from "lucide-react";
import type { MeResponse } from "@drinks-on-chain/mocks";
import { Alert, Button, Card, CardHeader, ErrorState, KeyValueList, Skeleton, StatusBadge } from "@drinks-on-chain/ui";
import { errorMessage } from "@/lib/api/errors";
import { canReadAuditWhileInactive, type InactiveOrganization } from "@/lib/auth/org-status";
import { useWinery } from "@/lib/erp/hooks";
import { BEVERAGE_CATEGORY } from "@/lib/erp/labels";
import { roleLabel } from "@/lib/erp/permissions";
import { PageChrome } from "./page-chrome";
import { OrganizationSwitcher } from "./organization-switcher";

// Pantalla de bodega no activa (SE-05, contrato de la Ola 1 §4): explica el estado y qué hacer,
// sin romper la navegación. En `SUSPENDED` la bodega sigue pudiendo leer sus datos y su bitácora.

type Copy = { title: string; body: (org: string) => string; next: (owner: boolean) => string };

const COPY: Record<InactiveOrganization["status"], Copy> = {
  INVITED: {
    title: "La bodega aún no está activa",
    body: (org) =>
      `${org} está invitada a Drinks on Chain y se activa cuando la dirección acepta la invitación que recibió por correo.`,
    next: (owner) =>
      owner
        ? "Abre el enlace del correo de invitación para activarla. Si caducó o no lo encuentras, pide al equipo de Drinks on Chain que te lo reenvíe."
        : "Podrás trabajar aquí en cuanto la dirección de la bodega la active.",
  },
  SUSPENDED: {
    title: "La bodega está suspendida",
    body: (org) =>
      `Drinks on Chain suspendió temporalmente ${org}. Mientras dure la suspensión no se pueden registrar ni consultar datos de trazabilidad.`,
    next: (owner) =>
      owner
        ? "Te enviamos el motivo por correo. Escribe al equipo de Drinks on Chain para resolverla; mientras tanto puedes ver los datos de la bodega, su bitácora y tu perfil."
        : "La dirección de la bodega recibió el motivo por correo y está en contacto con Drinks on Chain. Mientras tanto puedes ver tu perfil.",
  },
  REVOKED: {
    title: "El acceso de la bodega fue revocado",
    body: (org) =>
      `Drinks on Chain revocó la asociación de ${org}. Su información queda archivada y el ERP ya no se puede usar con ella.`,
    next: () => "Si crees que es un error, escribe al equipo de Drinks on Chain.",
  },
  UNKNOWN: {
    title: "La bodega no está activa",
    body: (org) => `${org} no está activa en este momento.`,
    next: () => "Vuelve a intentarlo más tarde o escribe al equipo de Drinks on Chain.",
  },
};

const ICONS = { INVITED: Clock, SUSPENDED: PauseCircle, REVOKED: Ban, UNKNOWN: ShieldAlert };

/** Datos de la bodega en lectura (permitidos en `SUSPENDED`). */
function WineryReadOnly() {
  const winery = useWinery();
  if (winery.isError) {
    return (
      <ErrorState
        bare
        description={errorMessage(winery.error)}
        onRetry={() => winery.refetch()}
        retrying={winery.isFetching}
      />
    );
  }
  if (!winery.data) return <Skeleton className="h-40" />;
  const w = winery.data;
  return (
    <KeyValueList
      items={[
        { term: "Nombre comercial", value: w.commercialName },
        { term: "Razón social", value: w.legalName },
        { term: "NIT", value: w.taxIdNit },
        { term: "Categoría", value: BEVERAGE_CATEGORY[w.beverageCategory] },
        { term: "Región", value: `${w.geographicRegion} · ${w.countryCode}` },
        { term: "Correo de contacto", value: w.contactEmail },
      ]}
    />
  );
}

export function InactiveOrganizationPanel({
  org,
  me,
  onSignOut,
  headingLevel = 1,
}: {
  org: InactiveOrganization;
  me: MeResponse;
  onSignOut: () => void;
  /** 1 como pantalla propia; 2 si otra pantalla ya tiene su h1. */
  headingLevel?: 1 | 2;
}) {
  const copy = COPY[org.status];
  const Icon = ICONS[org.status];
  const name = org.organizationName ?? "Tu bodega";
  const owner = org.role === "OWNER";
  const Heading = headingLevel === 1 ? "h1" : "h2";
  const inShell = org.organizationId === me.activeOrganizationId;
  const audit = canReadAuditWhileInactive(org);

  return (
    <div className="grid max-w-3xl grid-cols-1 gap-6">
      <header className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-4">
        <span className="grid size-12 place-items-center rounded-full bg-bg-sunken text-fg-muted">
          <Icon aria-hidden size={24} strokeWidth={1.5} />
        </span>
        <div className="grid gap-2">
          <Heading className="font-display text-3xl">{copy.title}</Heading>
          <p className="flex flex-wrap items-center gap-2 text-fg-muted">
            <span>
              {name} · {roleLabel(org.role)}
            </span>
            {org.status !== "UNKNOWN" && <StatusBadge kind="winery" status={org.status} />}
          </p>
        </div>
      </header>

      <Alert tone={org.status === "REVOKED" ? "danger" : org.status === "SUSPENDED" ? "warning" : "info"}>
        <p className="m-0">{copy.body(name)}</p>
      </Alert>

      <section aria-labelledby="inactive-next" className="grid gap-2">
        <h2 id="inactive-next" className="text-lg font-medium">
          Qué puedes hacer
        </h2>
        <p className="m-0">{copy.next(owner)}</p>
        <div className="flex flex-wrap items-center gap-2 pt-2">
          {inShell && (
            <Button asChild variant="secondary">
              <Link href="/perfil">Ver mi perfil</Link>
            </Button>
          )}
          {inShell && audit && (
            <Button asChild variant="secondary">
              <Link href="/ajustes/bitacora">Ver la bitácora</Link>
            </Button>
          )}
          {/* Dentro del shell el selector ya está en la cabecera. */}
          {!inShell && <OrganizationSwitcher me={me} />}
          <Button variant="tertiary" onClick={onSignOut}>
            Cerrar sesión
          </Button>
        </div>
      </section>

      {inShell && org.status === "SUSPENDED" && (
        <Card className="grid grid-cols-1 gap-4">
          <CardHeader title="Datos de la bodega" description="Solo lectura mientras dure la suspensión." />
          <WineryReadOnly />
        </Card>
      )}
    </div>
  );
}

/** Contenido de una ruta del ERP con la bodega no activa, dentro del shell. */
export function InactiveOrganizationScreen(props: {
  org: InactiveOrganization;
  me: MeResponse;
  onSignOut: () => void;
}) {
  return (
    <>
      <PageChrome breadcrumbs={[{ label: "Bodega no activa" }]} />
      <InactiveOrganizationPanel {...props} />
    </>
  );
}
