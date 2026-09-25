import type { ReactNode } from "react";
import { es } from "@/lib/i18n/es";

/**
 * h1 solo para lectores de pantalla en los estados de carga, error o vacío de una pantalla:
 * toda página tiene exactamente un h1. Con `busy` anuncia además que está cargando.
 */
export function ScreenTitle({ children, busy = false }: { children: ReactNode; busy?: boolean }) {
  return (
    <>
      <h1 className="sr-only">{children}</h1>
      {busy && (
        <p role="status" className="sr-only">
          {es.common.loading}
        </p>
      )}
    </>
  );
}
