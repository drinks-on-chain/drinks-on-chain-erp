"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { BreadcrumbItem } from "@drinks-on-chain/ui";

// Las páginas publican sus migas y su acción principal; el shell (en el layout) las pinta
// en la barra superior. Una sola acción principal por pantalla, arriba a la derecha (01-erp §11).

type Chrome = { breadcrumbs?: BreadcrumbItem[]; actions?: ReactNode };

const ChromeContext = createContext<{ chrome: Chrome; setChrome: (c: Chrome) => void } | null>(null);

export function PageChromeProvider({ children }: { children: ReactNode }) {
  const [chrome, setChrome] = useState<Chrome>({});
  return <ChromeContext.Provider value={{ chrome, setChrome }}>{children}</ChromeContext.Provider>;
}

export function usePageChromeValue(): Chrome {
  return useContext(ChromeContext)?.chrome ?? {};
}

/** Fija migas y acción principal mientras la página está montada. */
export function PageChrome({ breadcrumbs, actions }: Chrome) {
  const ctx = useContext(ChromeContext);
  const setChrome = ctx?.setChrome;
  const key = JSON.stringify(breadcrumbs ?? []);
  useEffect(() => {
    setChrome?.({ breadcrumbs, actions });
    return () => setChrome?.({});
    // Las migas se comparan por contenido; `actions` se actualiza con cada render de la página.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setChrome, key, actions]);
  return null;
}
