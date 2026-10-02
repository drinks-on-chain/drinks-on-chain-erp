"use client";

import { useState } from "react";
import { Paperclip } from "lucide-react";
import type { Lot, LotAttachment } from "@drinks-on-chain/mocks";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  ModalClose,
  Select,
  TextLink,
  toast,
} from "@drinks-on-chain/ui";
import { RuleViolationNotice } from "@/components/rule-violation-notice";
import { UploadField } from "@/features/origen/components/upload-field";
import { fieldErrorsFrom } from "@/lib/api/field-errors";
import { errorMessage } from "@/lib/api/errors";
import { isRuleError } from "@/lib/api/rule-violations";
import { useMe } from "@/lib/auth/hooks";
import { useAttachments, useChangeAttachmentVisibility, useCreateAttachment } from "@/lib/erp/hooks";
import { can } from "@/lib/erp/permissions";
import { fmtDateTime, shortHash } from "@/lib/format";
import { useReturnFocus } from "@/lib/use-return-focus";
import {
  ATTACHMENT_KIND,
  KIND_FOLDER,
  KIND_OPTIONS,
  VISIBILITY,
  emptyAttachment,
  sizeText,
  toAttachmentDto,
  type AttachmentErrors,
  type AttachmentValues,
} from "../attachments-model";
import { actorText } from "../lot-timeline";

type Props = { lot: Pick<Lot, "id" | "name" | "dossierStatus"> };

/**
 * Archivos del lote (contrato de la Ola 2 §11.5): informes, certificados, etiqueta y fotos, con su
 * huella y quién los adjuntó. Privados por defecto; los enlaces son URL firmadas de 15 minutos.
 */
export function LotAttachments({ lot }: Props) {
  const me = useMe();
  const attachments = useAttachments(lot.id);
  const [open, setOpen] = useState(false);
  const canAdd = can(me.data, "attachment.create") && lot.dossierStatus !== "CLOSED";
  const canPublish = can(me.data, "attachment.visibility");
  const add = canAdd ? (
    <Button variant="secondary" iconStart={<Paperclip aria-hidden size={16} />} onClick={() => setOpen(true)}>
      Adjuntar archivo
    </Button>
  ) : undefined;

  return (
    <Card padding="none">
      <CardHeader
        title="Archivos del lote"
        description="Privados salvo la etiqueta. Los informes del dictamen y del laboratorio aparecen aquí también."
        action={add}
        divided
        className="px-5 pt-5"
      />
      {attachments.isError ? (
        <div className="p-5">
          <ErrorState
            bare
            description={errorMessage(attachments.error)}
            onRetry={() => attachments.refetch()}
            retrying={attachments.isFetching}
          />
        </div>
      ) : (
        <DataTable<LotAttachment>
          caption={`Archivos de ${lot.name}`}
          captionHidden
          bleed
          data={attachments.data?.items ?? []}
          loading={attachments.isPending}
          getRowId={(a) => a.id}
          columns={[
            {
              id: "title",
              header: "Archivo",
              cell: (a) => (
                <span className="grid gap-0.5">
                  <TextLink variant="inline" href={a.url} target="_blank" rel="noreferrer">
                    {a.title}
                  </TextLink>
                  <span className="text-xs text-fg-muted">
                    {ATTACHMENT_KIND[a.kind]} · {sizeText(a.sizeBytes)}
                  </span>
                </span>
              ),
            },
            {
              id: "visibility",
              header: "Visibilidad",
              cell: (a) => <Badge tone={VISIBILITY[a.visibility].tone}>{VISIBILITY[a.visibility].label}</Badge>,
            },
            {
              id: "sha",
              header: "Huella SHA-256",
              hideBelow: "lg",
              cell: (a) => (
                <code className="font-mono text-xs" title={a.sha256}>
                  {shortHash(a.sha256, 8, 8)}
                </code>
              ),
            },
            {
              id: "by",
              header: "Adjuntado",
              hideBelow: "md",
              cell: (a) => (
                <span className="grid gap-0.5 text-sm">
                  <span>{fmtDateTime(a.createdAt)}</span>
                  <span className="text-xs text-fg-muted">{actorText(a.createdBy)}</span>
                </span>
              ),
            },
          ]}
          rowActions={canPublish ? (a) => <VisibilityAction lotId={lot.id} attachment={a} /> : undefined}
          empty={
            <EmptyState
              bare
              title="Sin archivos"
              description="Adjunta informes, certificados o fotos del lote: quedan privados."
              action={add}
            />
          }
        />
      )}
      {canAdd && <AttachmentForm lot={lot} open={open} onOpenChange={setOpen} />}
    </Card>
  );
}

/** Cambio de visibilidad (`POST …/visibility`): solo inserción, queda registrado. */
function VisibilityAction({ lotId, attachment: a }: { lotId: string; attachment: LotAttachment }) {
  const change = useChangeAttachmentVisibility();
  const [ruleError, setRuleError] = useState<unknown>(null);
  const next = a.visibility === "PRIVATE" ? "PUBLIC" : "PRIVATE";
  return (
    <span className="grid justify-items-end gap-2">
      <ConfirmDialog
        title={next === "PUBLIC" ? `¿Hacer público «${a.title}»?` : `¿Volver privado «${a.title}»?`}
        description={`${VISIBILITY[next].detail} El cambio queda registrado en la bitácora.`}
        confirmLabel={next === "PUBLIC" ? "Sí, hacer público" : "Sí, volver privado"}
        trigger={
          <Button size="sm" variant="tertiary" onClick={() => setRuleError(null)}>
            {next === "PUBLIC" ? "Hacer público" : "Volver privado"}
            <span className="sr-only"> {a.title}</span>
          </Button>
        }
        onConfirm={async () => {
          try {
            await change.mutateAsync({ lotId, attachmentId: a.id, body: { visibility: next } });
            toast({
              title: next === "PUBLIC" ? "Archivo público" : "Archivo privado",
              description: a.title,
              tone: "success",
            });
          } catch (err) {
            if (isRuleError(err)) setRuleError(err);
            else throw new Error(errorMessage(err), { cause: err });
          }
        }}
      />
      <RuleViolationNotice error={ruleError} />
    </span>
  );
}

function AttachmentForm({ lot, open, onOpenChange }: Props & { open: boolean; onOpenChange: (open: boolean) => void }) {
  const create = useCreateAttachment();
  const [values, setValues] = useState<AttachmentValues>(emptyAttachment);
  const [errors, setErrors] = useState<AttachmentErrors>({});
  const [uploading, setUploading] = useState(false);
  useReturnFocus(open);
  const busy = create.isPending || uploading;

  const change = (next: boolean) => {
    if (busy) return;
    if (next) {
      setValues(emptyAttachment());
      setErrors({});
      create.reset();
    }
    onOpenChange(next);
  };

  async function submit() {
    create.reset();
    const result = toAttachmentDto(values);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    try {
      const saved = await create.mutateAsync({ lotId: lot.id, body: result.dto });
      toast({
        title: "Archivo adjuntado",
        description: `${saved.title} · ${VISIBILITY[saved.visibility].label.toLowerCase()}`,
        tone: "success",
      });
      onOpenChange(false);
    } catch (err) {
      setErrors(fieldErrorsFrom<keyof AttachmentValues>(err, ["kind", "title", "key"]).fieldErrors);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={change}
      dismissible={!busy}
      size="md"
      title="Adjuntar archivo"
      description={`${lot.name}. Queda privado (la etiqueta nace pública) y con su huella SHA-256.`}
      footer={
        <>
          <ModalClose asChild>
            <Button variant="secondary" size="lg" disabled={busy}>
              Cancelar
            </Button>
          </ModalClose>
          <Button size="lg" loading={create.isPending} disabled={uploading} onClick={submit}>
            Adjuntar
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4">
        <Field label="Tipo de archivo" required error={errors.kind}>
          <Select
            value={values.kind}
            // Cada tipo va a su carpeta: al cambiarlo se vuelve a elegir el archivo.
            onValueChange={(kind) => setValues((v) => ({ ...v, kind: kind as AttachmentValues["kind"], key: null }))}
            options={KIND_OPTIONS}
          />
        </Field>
        <Field label="Título" required error={errors.title} help="Cómo se verá en la lista. Hasta 200 caracteres.">
          <Input
            value={values.title}
            maxLength={200}
            onChange={(e) => {
              const title = e.target.value;
              setValues((v) => ({ ...v, title }));
              setErrors((x) => ({ ...x, title: undefined }));
            }}
          />
        </Field>
        <UploadField
          label="Archivo"
          folder={KIND_FOLDER[values.kind]}
          value={values.key}
          onChange={(key) => {
            setValues((v) => ({ ...v, key }));
            setErrors((x) => ({ ...x, key: undefined }));
          }}
          onBusyChange={setUploading}
          help="PDF o imagen, hasta 15 MB."
        />
        {errors.key && (
          <p role="alert" className="m-0 text-sm text-danger-text">
            {errors.key}
          </p>
        )}
        <RuleViolationNotice error={create.error} fields={["kind", "title", "key"]} />
      </div>
    </Modal>
  );
}
