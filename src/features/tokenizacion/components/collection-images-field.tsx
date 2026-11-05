"use client";

import { useId, useState } from "react";
import { ImagePlus, Star, X } from "lucide-react";
import { UPLOAD_MAX_IMAGE_BYTES } from "@drinks-on-chain/mocks";
import { Badge, Button, Field, Input, Spinner } from "@drinks-on-chain/ui";
import { errorMessage } from "@/lib/api/errors";
import { useStoredFileUrl, useUpload } from "@/lib/erp/hooks";
import { storedFileName } from "@/lib/erp/stored-file";
import { MAX_IMAGES, addImage, removeImage, setAlt, setCover, type FormImage } from "../tokenization-model";

const IMAGE_TYPES: readonly string[] = ["image/jpeg", "image/png", "image/webp"];

type Props = {
  value: FormImage[];
  onChange: (images: FormImage[]) => void;
  onBusyChange?: (busy: boolean) => void;
  error?: string;
  disabled?: boolean;
};

/** Miniatura de una foto guardada: pide su URL firmada al mostrarse (caduca a los 15 minutos). */
function Thumbnail({ image }: { image: FormImage }) {
  const signed = useStoredFileUrl(image.key);
  const label = image.alt.trim() || "Foto sin descripción todavía";
  return signed.data?.url ? (
    <span
      role="img"
      aria-label={label}
      className="block h-20 w-20 shrink-0 rounded-md border border-border bg-bg-sunken bg-cover bg-center"
      style={{ backgroundImage: `url("${signed.data.url}")` }}
    />
  ) : (
    <span
      aria-hidden
      className="grid h-20 w-20 shrink-0 place-items-center rounded-md border border-border bg-bg-sunken text-fg-muted"
    >
      <ImagePlus size={20} strokeWidth={1.5} />
    </span>
  );
}

/**
 * Fotos de la colección (`commercial.imageKeys`, contrato de la Ola 3 §5.5): hasta 8, cada una con
 * su descripción, y una sola de portada. Se suben con `POST /v1/uploads` en cuanto se eligen; son
 * privadas hasta que Drinks on Chain publique la colección.
 */
export function CollectionImagesField({ value, onChange, onBusyChange, error, disabled }: Props) {
  const upload = useUpload();
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const id = useId();
  const full = value.length >= MAX_IMAGES;

  async function handleFile(file: File | undefined) {
    setUploadError(null);
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) {
      setUploadError("Formato no admitido: sube una imagen JPG, PNG o WebP.");
      return;
    }
    if (file.size > UPLOAD_MAX_IMAGE_BYTES) {
      setUploadError("La imagen supera los 5 MB.");
      return;
    }
    onBusyChange?.(true);
    try {
      const res = await upload.mutateAsync([file, "collections"]);
      onChange(addImage(value, res.key));
    } catch (e) {
      setUploadError(errorMessage(e));
    } finally {
      onBusyChange?.(false);
      setInputKey((k) => k + 1);
    }
  }

  return (
    <Field
      label="Fotos de la colección"
      htmlFor={id}
      error={uploadError ?? error}
      disabled={disabled}
      help={`Opcional al enviar: hasta ${MAX_IMAGES} imágenes JPG, PNG o WebP de 5 MB como máximo. Drinks on Chain necesita al menos una de portada para aprobar la solicitud.`}
    >
      <div className="grid grid-cols-1 gap-3">
        {value.length > 0 && (
          <ul aria-label="Fotos subidas" className="m-0 grid list-none gap-3 p-0">
            {value.map((image, index) => (
              <li
                key={image.key}
                className="flex flex-wrap items-start gap-3 rounded-md border border-border bg-bg-raised p-3"
              >
                <Thumbnail image={image} />
                <div className="grid min-w-0 flex-1 gap-2">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="min-w-0 truncate font-mono text-xs text-fg-muted">
                      {storedFileName(image.key)}
                    </span>
                    {image.isCover && <Badge tone="accent">Portada</Badge>}
                  </div>
                  <Input
                    aria-label={`Descripción de la foto ${index + 1}`}
                    placeholder="Qué se ve en la foto"
                    value={image.alt}
                    maxLength={300}
                    disabled={disabled}
                    onChange={(e) => onChange(setAlt(value, image.key, e.target.value))}
                  />
                  <div className="flex flex-wrap gap-2">
                    {!image.isCover && (
                      <Button
                        type="button"
                        size="sm"
                        variant="tertiary"
                        iconStart={<Star aria-hidden size={14} />}
                        disabled={disabled}
                        onClick={() => onChange(setCover(value, image.key))}
                      >
                        Usar como portada<span className="sr-only">: foto {index + 1}</span>
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="tertiary"
                      iconStart={<X aria-hidden size={14} />}
                      disabled={disabled || upload.isPending}
                      onClick={() => onChange(removeImage(value, image.key))}
                    >
                      Quitar<span className="sr-only">: foto {index + 1}</span>
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center gap-3">
          <input
            key={inputKey}
            id={id}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={disabled || upload.isPending || full}
            onChange={(e) => handleFile(e.target.files?.[0])}
            className="min-h-10 w-full cursor-pointer font-ui text-sm text-fg-muted file:mr-3 file:min-h-10 file:cursor-pointer file:rounded-md file:border file:border-border-strong file:bg-bg-raised file:px-4 file:font-ui file:text-sm file:font-medium file:text-fg disabled:cursor-not-allowed disabled:opacity-60"
          />
          {upload.isPending && <Spinner size="sm" label="Subiendo…" />}
        </div>
        {full && <p className="m-0 text-sm text-fg-muted">Ya hay {MAX_IMAGES} fotos: quita una para subir otra.</p>}
      </div>
    </Field>
  );
}
