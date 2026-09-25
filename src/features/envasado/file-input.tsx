"use client";

import { useFieldControl } from "@drinks-on-chain/ui";

// Selector de archivo nativo conectado al Field (etiqueta, ayuda y error). El archivo se
// sube con useUpload al enviar el formulario; aquí solo se elige.

export const UPLOAD_ACCEPT = "application/pdf,image/jpeg,image/png,image/webp";
export const UPLOAD_MAX_MB = 15;

export function FileInput({
  accept = UPLOAD_ACCEPT,
  onFile,
  disabled,
}: {
  accept?: string;
  onFile: (file: File | null) => void;
  disabled?: boolean;
}) {
  const control = useFieldControl({ disabled });
  return (
    <input
      type="file"
      accept={accept}
      {...control}
      onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      className="text-fg-muted file:border-border-strong file:bg-bg-raised file:text-fg hover:file:bg-bg-sunken block w-full cursor-pointer text-sm file:mr-3 file:cursor-pointer file:rounded-md file:border file:px-4 file:py-2 file:text-sm file:font-medium"
    />
  );
}

/** Error de tamaño antes de subir (el backend acepta hasta 15 MB). */
export const fileTooBig = (f: File | null) => !!f && f.size > UPLOAD_MAX_MB * 1024 * 1024;
