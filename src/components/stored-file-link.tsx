"use client";

import type { ReactNode } from "react";
import { FileText } from "lucide-react";
import { TextLink } from "@drinks-on-chain/ui";
import { useStoredFileUrl } from "@/lib/erp/hooks";
import { isStorageKey } from "@/lib/erp/stored-file";

/**
 * Enlace a un archivo guardado (certificado, informe, etiqueta). Con una clave del almacenamiento
 * pide la URL firmada al mostrarse (`GET /v1/uploads/url`); con una URL o ruta antigua, la enlaza
 * tal cual. Se abre en otra pestaña.
 */
export function StoredFileLink({ reference, children }: { reference: string; children: ReactNode }) {
  const key = isStorageKey(reference) ? reference : null;
  const signed = useStoredFileUrl(key);
  const href = key ? signed.data?.url : reference;

  if (key && signed.isError) {
    return <span className="text-sm text-fg-muted">Archivo no disponible</span>;
  }
  if (!href) {
    return (
      <span className="inline-flex gap-1 text-sm text-fg-muted" aria-busy="true">
        <FileText aria-hidden size={16} />
        {children}
      </span>
    );
  }
  return (
    <TextLink variant="inline" href={href} target="_blank" rel="noreferrer" className="inline-flex gap-1">
      <FileText aria-hidden size={16} />
      {children}
    </TextLink>
  );
}
