import { CreateLotAttachmentSchema, type CreateLotAttachmentDto, type LotAttachment } from "@drinks-on-chain/mocks";
import type { Tone } from "@drinks-on-chain/ui";
import type { UploadFolder } from "@/lib/erp/resources";
import { fmtNumber } from "@/lib/format";

type LotAttachmentKind = LotAttachment["kind"];

// Archivos del lote (contrato de la Ola 2 §11.5): informes, certificados, etiqueta y fotos. Todo
// nace privado salvo la etiqueta; hacer público un archivo lo deciden dirección y enología, y el
// cambio queda registrado. La URL que devuelve el servidor es firmada y caduca a los 15 minutos.

export const ATTACHMENT_KIND: Record<LotAttachmentKind, string> = {
  LAB_REPORT: "Informe de laboratorio",
  PHYTO_REPORT: "Informe fitosanitario",
  LABEL: "Etiqueta",
  DO_CERTIFICATE: "Certificado de D.O.",
  PHOTO: "Foto",
  OTHER: "Otro documento",
};

export const KIND_OPTIONS = (Object.keys(ATTACHMENT_KIND) as LotAttachmentKind[]).map((value) => ({
  value,
  label: ATTACHMENT_KIND[value],
}));

/** Carpeta del almacenamiento para cada tipo (`POST /v1/uploads?folder=`). */
export const KIND_FOLDER: Record<LotAttachmentKind, UploadFolder> = {
  LAB_REPORT: "lab-reports",
  PHYTO_REPORT: "inspections",
  LABEL: "labels",
  DO_CERTIFICATE: "certificates",
  PHOTO: "certificates",
  OTHER: "certificates",
};

export const VISIBILITY: Record<LotAttachment["visibility"], { label: string; tone: Tone; detail: string }> = {
  PRIVATE: { label: "Privado", tone: "neutral", detail: "Solo lo ve el equipo de la bodega." },
  PUBLIC: { label: "Público", tone: "info", detail: "Puede mostrarse en el pasaporte del lote." },
};

/** "184 KB" / "2,4 MB". */
export function sizeText(bytes: number): string {
  if (bytes < 1024) return `${fmtNumber(bytes)} B`;
  if (bytes < 1024 * 1024) return `${fmtNumber(Math.round(bytes / 1024))} KB`;
  return `${fmtNumber(bytes / (1024 * 1024), 1)} MB`;
}

export type AttachmentValues = { kind: LotAttachmentKind; title: string; key: string | null };
export type AttachmentErrors = Partial<Record<keyof AttachmentValues, string>>;

export const emptyAttachment = (): AttachmentValues => ({ kind: "OTHER", title: "", key: null });

type Result = { ok: true; dto: CreateLotAttachmentDto } | { ok: false; errors: AttachmentErrors };

/** Valores del formulario → `POST /v1/lots/{id}/attachments`. La visibilidad inicial la pone el servidor. */
export function toAttachmentDto(v: AttachmentValues): Result {
  const errors: AttachmentErrors = {};
  const title = v.title.trim();
  if (!title) errors.title = "Ponle un título al archivo.";
  else if (title.length > 200) errors.title = "El título admite hasta 200 caracteres.";
  if (!v.key) errors.key = "Elige el archivo.";
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const dto: CreateLotAttachmentDto = { key: v.key!, kind: v.kind, title };
  const parsed = CreateLotAttachmentSchema.safeParse(dto);
  if (!parsed.success) return { ok: false, errors: { title: parsed.error.issues.map((i) => i.message).join(" ") } };
  return { ok: true, dto };
}
