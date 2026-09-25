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
import { AppShell, Button, EmptyState, Spinner, type NavGroup } from "@drinks-on-chain/ui";
import { useIsAuthenticated, useLogout, useMe } from "@/lib/auth/hooks";
import { useWinery } from "@/lib/erp/hooks";
import { canUseErp, roleLabel } from "@/lib/erp/permissions";
import { es } from "@/lib/i18n/es";
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

/** Protege las rutas privadas del ERP y monta el AppShell. */
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
  const winery = useWinery(allowed === true && me.data?.userRole !== "PLATFORM_ADMIN");
  const chrome = usePageChromeValue();

  const signOut = () => {
    logout();
    router.replace("/login");
  };

  if (me.isPending) return <FullScreenSpinner />;

  if (allowed === false) {
    return (
      <main className="grid min-h-dvh place-items-center p-6">
        <EmptyState
          title="Este acceso no es para el ERP"
          description="El ERP es para los equipos de las bodegas asociadas. Si crees que es un error, contacta con la administración de tu bodega."
          action={<Button onClick={signOut}>{es.auth.logout}</Button>}
        />
      </main>
    );
  }

  const membership = me.data?.wineryMemberships.find((m) => m.isActive) ?? me.data?.wineryMemberships[0];
  const wineryName =
    winery.data?.commercialName ??
    membership?.wineryName ??
    (me.data?.userRole === "PLATFORM_ADMIN" ? "Todas las bodegas" : "");
  const role = roleLabel(membership?.memberRole ?? me.data?.userRole);

  return (
    <AppShell
      navigation={navigation}
      currentPath={pathname}
      linkComponent={Link}
      user={me.data ? { name: me.data.fullName, role: wineryName ? `${role} · ${wineryName}` : role } : undefined}
      userMenu={[
        { label: "Perfil", href: "/perfil" },
        { type: "separator" },
        { label: es.auth.logout, onSelect: signOut },
      ]}
      breadcrumbs={[{ label: wineryName || "ERP", href: "/" }, ...(chrome.breadcrumbs ?? [])]}
      topbarActions={chrome.actions}
    >
      {children}
    </AppShell>
  );
}
