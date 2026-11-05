"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChartColumn,
  Coins,
  Cylinder,
  FlaskConical,
  Grape,
  Landmark,
  Layers,
  LayoutGrid,
  Mountain,
  QrCode,
  ScrollText,
  Settings,
  ShieldAlert,
  Users,
  Wine,
} from "lucide-react";
import type { MeResponse } from "@/lib/auth/schemas";
import { AppShell, Button, EmptyState, ErrorState, Spinner, type NavGroup, type NavItem } from "@drinks-on-chain/ui";
import { errorMessage } from "@/lib/api/errors";
import { useIsAuthenticated, useLogout, useMe, useOrgInactiveFlag } from "@/lib/auth/hooks";
import { canReadAuditWhileInactive, inactiveOrganization, type InactiveOrganization } from "@/lib/auth/org-status";
import { activeMembership } from "@/lib/auth/organization";
import { env } from "@/lib/env";
import { useWinery } from "@/lib/erp/hooks";
import { can, canUseErp, isPlatform, roleLabel, type ErpAction } from "@/lib/erp/permissions";
import { es } from "@/lib/i18n/es";
import { InactiveOrganizationPanel, InactiveOrganizationScreen } from "./inactive-organization";
import { OrganizationSwitcher } from "./organization-switcher";
import { PageChromeProvider, usePageChromeValue } from "./page-chrome";

const icon = (I: typeof Grape) => <I aria-hidden size={20} strokeWidth={1.5} />;

// Módulos del ERP (03 §4 y 01-erp.html). Cada módulo aparece si el rol de la membresía activa
// puede leerlo (matriz del backend); "Bitácora" solo para la dirección de la bodega.
function navigationFor(me: MeResponse | undefined): NavGroup[] {
  const show = (action: ErpAction) => can(me, action);
  const trace = (
    [
      // El lote es la entidad del servidor que agrupa la cadena: lo ven todos los roles (Ola 2 §14).
      show("lot.read") && { label: "Lotes", href: "/lotes", icon: icon(Layers) },
      show("terroir.read") && { label: "Origen y terroirs", href: "/origen", icon: icon(Mountain) },
      show("harvest.read") && { label: "Vendimia y laboratorio", href: "/vendimia", icon: icon(Grape) },
      show("tank.read") && { label: "Vinificación", href: "/vinificacion", icon: icon(Cylinder) },
      show("aging.read") && { label: "Crianza", href: "/crianza", icon: icon(Wine) },
      show("distillation.read") && { label: "Destilación y reposo", href: "/destilacion", icon: icon(FlaskConical) },
      show("bottling.read") && { label: "Envasado y QR", href: "/envasado", icon: icon(QrCode) },
      // 1K, detrás de la bandera: solicitudes de la bodega (la plataforma las ve en el Backoffice).
      env.tokenization &&
        !isPlatform(me) &&
        show("tokenization.read") && { label: "Tokenización", href: "/tokenizacion", icon: icon(Coins) },
      show("reports.read") && { label: "Reportes", href: "/reportes", icon: icon(ChartColumn) },
    ] as (NavItem | false)[]
  ).filter((item): item is NavItem => Boolean(item));
  const winery = (
    [
      // La cuenta de la bodega en la red la leen todos los miembros (Ola 3 §10).
      show("chainAccount.read") && { label: "Cuenta de la bodega", href: "/cuenta", icon: icon(Landmark) },
      { label: "Equipo", href: "/equipo", icon: icon(Users) },
      { label: "Ajustes", href: "/ajustes", exact: true, icon: icon(Settings) },
      show("winery.manage") && { label: "Bitácora", href: "/ajustes/bitacora", icon: icon(ScrollText) },
    ] as (NavItem | false)[]
  ).filter((item): item is NavItem => Boolean(item));
  return [
    { items: [{ label: "Panel", href: "/", exact: true, icon: icon(LayoutGrid) }] },
    { label: "Trazabilidad", items: trace },
    { label: "Bodega", items: winery },
  ];
}

/** Con la bodega no activa: el estado y, en `SUSPENDED`, la bitácora de la dirección. */
const inactiveNavigation = (org: InactiveOrganization): NavGroup[] => [
  { items: [{ label: "Estado de la bodega", href: "/", exact: true, icon: icon(ShieldAlert) }] },
  ...(canReadAuditWhileInactive(org)
    ? [{ label: "Bodega", items: [{ label: "Bitácora", href: "/ajustes/bitacora", icon: icon(ScrollText) }] }]
    : []),
];

/** Rutas que siguen abiertas con la bodega no activa (perfil propio y, en `SUSPENDED`, la bitácora). */
function openWhileInactive(pathname: string, org: InactiveOrganization): boolean {
  if (pathname === "/perfil") return true;
  return pathname === "/ajustes/bitacora" && canReadAuditWhileInactive(org);
}

function FullScreenSpinner() {
  return (
    <div className="grid min-h-dvh place-items-center" aria-busy="true">
      <Spinner label={es.common.loading} />
    </div>
  );
}

/**
 * Protege las rutas privadas del ERP y monta el AppShell. Mientras se recupera la sesión al
 * arrancar (renovación con la cookie) muestra un spinner; sin sesión lleva al login.
 */
export function AppFrame({ children }: { children: ReactNode }) {
  const authenticated = useIsAuthenticated();
  const router = useRouter();

  useEffect(() => {
    if (authenticated === false) router.replace("/login");
  }, [authenticated, router]);

  if (!authenticated) return <FullScreenSpinner />;
  return (
    <PageChromeProvider>
      <ErpShell>{children}</ErpShell>
    </PageChromeProvider>
  );
}

function ErpShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const logout = useLogout();
  const me = useMe();
  const flag = useOrgInactiveFlag();
  // Un 403 ORG_NOT_ACTIVE manda solo si es más reciente que `me` (que se vuelve a leer al recibirlo).
  const inactive = inactiveOrganization(me.data, flag && flag.at > me.dataUpdatedAt ? flag.status : null);
  const allowed = me.data ? canUseErp(me.data) : undefined;
  const platform = isPlatform(me.data);
  // El perfil de la bodega se sigue leyendo en SUSPENDED; en INVITED y REVOKED el backend lo niega.
  const winery = useWinery(allowed === true && !platform && (!inactive || inactive.status === "SUSPENDED"));
  const chrome = usePageChromeValue();

  const signOut = async () => {
    await logout();
    router.replace("/login");
  };

  if (me.isPending) return <FullScreenSpinner />;

  // Sin perfil no se sabe el rol ni la bodega: se pide reintentar en vez de montar las pantallas
  // (cada una volvería a pedir `me` al montarse y el fallo entraría en bucle).
  if (me.isError && !me.data) {
    return (
      <main className="grid min-h-dvh place-items-center p-6">
        <h1 className="sr-only">ERP de Drinks on Chain</h1>
        <div className="grid justify-items-center gap-3">
          <ErrorState title={es.auth.sessionError} description={errorMessage(me.error)} onRetry={() => me.refetch()} />
          <Button variant="tertiary" onClick={() => void signOut()}>
            {es.auth.logout}
          </Button>
        </div>
      </main>
    );
  }

  // Sin organización activa por culpa de la bodega (p. ej. revocada): se explica, sin shell.
  if (me.data && inactive && inactive.organizationId !== me.data.activeOrganizationId) {
    return (
      <main id="contenido" className="grid min-h-dvh place-items-center p-6">
        <InactiveOrganizationPanel org={inactive} me={me.data} onSignOut={() => void signOut()} />
      </main>
    );
  }

  // Guardia por audiencia y organización activa (contrato de la Ola 0 §6): el ERP es del
  // personal de una bodega (o de la plataforma, en solo lectura).
  if (allowed === false) {
    return (
      <main className="grid min-h-dvh place-items-center p-6">
        <h1 className="sr-only">ERP de Drinks on Chain</h1>
        <div className="grid justify-items-center gap-3">
          <EmptyState
            title="Este acceso no es para el ERP"
            description="El ERP es para los equipos de las bodegas asociadas. Si crees que es un error, contacta con la administración de tu bodega."
            action={<Button onClick={() => void signOut()}>{es.auth.logout}</Button>}
          />
          {/* Con otra membresía utilizable, se puede cambiar a ella sin salir. */}
          {me.data && <OrganizationSwitcher me={me.data} />}
        </div>
      </main>
    );
  }

  const active = activeMembership(me.data);
  const wineryName = (platform ? "Todas las bodegas" : (winery.data?.commercialName ?? active?.organizationName)) ?? "";
  const role = roleLabel(active?.role);

  return (
    <>
      {/* Salta la barra lateral y la superior (WCAG 2.4.1). */}
      <a
        href="#contenido"
        className="sr-only rounded-md bg-bg px-4 py-2 font-medium text-fg shadow-overlay focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:outline-2 focus:outline-offset-2 focus:outline-focus"
      >
        Saltar al contenido
      </a>
      <AppShell
        navigation={inactive ? inactiveNavigation(inactive) : navigationFor(me.data)}
        currentPath={pathname}
        linkComponent={Link}
        user={
          me.data ? { name: me.data.user.fullName, role: wineryName ? `${role} · ${wineryName}` : role } : undefined
        }
        userMenu={[
          { label: "Perfil", href: "/perfil" },
          { type: "separator" },
          { label: es.auth.logout, onSelect: () => void signOut() },
        ]}
        breadcrumbs={[{ label: wineryName || "ERP", href: "/" }, ...(chrome.breadcrumbs ?? [])]}
        topbarActions={
          <>
            {me.data && <OrganizationSwitcher me={me.data} />}
            {chrome.actions}
          </>
        }
      >
        <div id="contenido" tabIndex={-1} className="outline-none">
          {inactive && me.data && !openWhileInactive(pathname, inactive) ? (
            <InactiveOrganizationScreen org={inactive} me={me.data} onSignOut={() => void signOut()} />
          ) : (
            children
          )}
        </div>
      </AppShell>
    </>
  );
}
