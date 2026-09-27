"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Cylinder,
  FlaskConical,
  Grape,
  Layers,
  LayoutGrid,
  Mountain,
  QrCode,
  Settings,
  Wallet,
  Wine,
} from "lucide-react";
import { AppShell, Button, EmptyState, ErrorState, Spinner, type NavGroup } from "@drinks-on-chain/ui";
import { errorMessage } from "@/lib/api/errors";
import { useIsAuthenticated, useLogout, useMe } from "@/lib/auth/hooks";
import { activeMembership } from "@/lib/auth/organization";
import { useWinery } from "@/lib/erp/hooks";
import { canUseErp, isPlatform, roleLabel } from "@/lib/erp/permissions";
import { es } from "@/lib/i18n/es";
import { OrganizationSwitcher } from "./organization-switcher";
import { PageChromeProvider, usePageChromeValue } from "./page-chrome";

const icon = (I: typeof Grape) => <I aria-hidden size={20} strokeWidth={1.5} />;

// Módulos del ERP (03 §4 y 01-erp.html).
const navigation: NavGroup[] = [
  { items: [{ label: "Panel", href: "/", exact: true, icon: icon(LayoutGrid) }] },
  {
    label: "Trazabilidad",
    items: [
      { label: "Lotes", href: "/lotes", icon: icon(Layers) },
      { label: "Origen y terroirs", href: "/origen", icon: icon(Mountain) },
      { label: "Vendimia y laboratorio", href: "/vendimia", icon: icon(Grape) },
      { label: "Vinificación", href: "/vinificacion", icon: icon(Cylinder) },
      { label: "Crianza", href: "/crianza", icon: icon(Wine) },
      { label: "Destilación y reposo", href: "/destilacion", icon: icon(FlaskConical) },
      { label: "Envasado y QR", href: "/envasado", icon: icon(QrCode) },
    ],
  },
  {
    label: "Bodega",
    items: [
      { label: "Cuenta Stellar", href: "/cuenta", icon: icon(Wallet) },
      { label: "Ajustes", href: "/ajustes", icon: icon(Settings) },
    ],
  },
];

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
  const allowed = me.data ? canUseErp(me.data) : undefined;
  const platform = isPlatform(me.data);
  const winery = useWinery(allowed === true && !platform);
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
        navigation={navigation}
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
          {children}
        </div>
      </AppShell>
    </>
  );
}
