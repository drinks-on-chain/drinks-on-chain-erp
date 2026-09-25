"use client";

import { useId, useState, type ReactNode } from "react";
import { FileText, X } from "lucide-react";
import { UPLOAD_MAX_BYTES, UPLOAD_MIME_TYPES } from "@drinks-on-chain/mocks";
import { Button, Field, Spinner, TextLink } from "@drinks-on-chain/ui";
import { errorMessage } from "@/lib/api/errors";
import { useUpload } from "@/lib/erp/hooks";
import type { UploadFolder } from "@/lib/erp/resources";

type Props = {
  label: ReactNode;
  folder: UploadFolder;
  /** URL devuelta por POST /v1/uploads (la que viaja en el DTO). */
  value: string | null;
  onChange: (url: string | null) => void;
  onBusyChange?: (busy: boolean) => void;
  help?: ReactNode;
  accept?: string;
  disabled?: boolean;
};

const fileName = (url: string) => decodeURIComponent(url.split("/").at(-1) ?? url).replace(/^\d+-/, "");

/** Sube un archivo (PDF o imagen, ≤ 15 MB) en cuanto se elige y guarda su URL (09 §1 "Archivos"). */
export function UploadField({ label, folder, value, onChange, onBusyChange, help, accept, disabled }: Props) {
  const upload = useUpload();
  const [error, setError] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const id = useId();

  async function handleFile(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (!(UPLOAD_MIME_TYPES as readonly string[]).includes(file.type)) {
      setError("Formato no admitido: sube un PDF o una imagen (JPG, PNG, WebP).");
      return;
    }
    if (file.size > UPLOAD_MAX_BYTES) {
      setError("El archivo supera los 15 MB.");
      return;
    }
    onBusyChange?.(true);
    try {
      const res = await upload.mutateAsync([file, folder]);
      onChange(res.url);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      onBusyChange?.(false);
      setInputKey((k) => k + 1);
    }
  }

  return (
    <Field label={label} help={help} error={error ?? undefined} htmlFor={id} disabled={disabled}>
      <div className="grid grid-cols-1 gap-2">
        {value && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-bg-sunken px-3 py-2 text-sm">
            <FileText aria-hidden size={16} className="text-fg-muted" />
            <TextLink href={value} target="_blank" rel="noreferrer" variant="inline" className="min-w-0 truncate">
              {fileName(value)}
            </TextLink>
            <Button
              type="button"
              size="sm"
              variant="tertiary"
              className="ml-auto"
              iconStart={<X aria-hidden size={14} />}
              onClick={() => onChange(null)}
              disabled={disabled || upload.isPending}
            >
              Quitar
            </Button>
          </div>
        )}
        <div className="flex items-center gap-3">
          <input
            key={inputKey}
            id={id}
            type="file"
            accept={accept ?? "application/pdf,image/*"}
            disabled={disabled || upload.isPending}
            onChange={(e) => handleFile(e.target.files?.[0])}
            className="min-h-10 w-full cursor-pointer font-ui text-sm text-fg-muted file:mr-3 file:min-h-10 file:cursor-pointer file:rounded-md file:border file:border-border-strong file:bg-bg-raised file:px-4 file:font-ui file:text-sm file:font-medium file:text-fg disabled:cursor-not-allowed disabled:opacity-60"
          />
          {upload.isPending && <Spinner size="sm" label="Subiendo…" />}
        </div>
      </div>
    </Field>
  );
}
