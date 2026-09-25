"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AppShell, Spinner, type NavGroup } from "@drinks-on-chain/ui";
import { useIsAuthenticated, useLogout, useMe } from "@/lib/auth/hooks";
import { es } from "@/lib/i18n/es";

// Navegación de ejemplo: cada app define la suya.
const navigation: NavGroup[] = [{ items: [{ label: "Inicio", href: "/", exact: true }] }];

/** Protege las rutas privadas y monta el shell. La sesión vive en el navegador. */
export function AppFrame({ children }: { children: ReactNode }) {
  const authenticated = useIsAuthenticated();
  const router = useRouter();
  const pathname = usePathname();
  const logout = useLogout();
  const me = useMe(authenticated === true);

  useEffect(() => {
    if (authenticated === false) router.replace("/login");
  }, [authenticated, router]);

  if (!authenticated) {
    return (
      <div className="grid min-h-dvh place-items-center" aria-busy="true">
        <Spinner label={es.common.loading} />
      </div>
    );
  }

  return (
    <AppShell
      navigation={navigation}
      currentPath={pathname}
      linkComponent={Link}
      user={me.data ? { name: me.data.fullName, role: me.data.email } : undefined}
      userMenu={[
        {
          label: es.auth.logout,
          onSelect: () => {
            logout();
            router.replace("/login");
          },
        },
      ]}
    >
      {children}
    </AppShell>
  );
}
