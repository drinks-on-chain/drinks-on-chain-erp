"use client";

import { useState } from "react";
import { Download, FileArchive } from "lucide-react";
import type { BottleUnit, Lot } from "@drinks-on-chain/mocks";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Checkbox,
  DataTable,
  EmptyState,
  Field,
  Input,
  Select,
  TextLink,
  toast,
} from "@drinks-on-chain/ui";
import { ReasonAction } from "@/components/reason-action";
import { RuleViolationNotice } from "@/components/rule-violation-notice";
import { errorMessage } from "@/lib/api/errors";
import { isRuleError } from "@/lib/api/rule-violations";
import {
  useBottleCodeExport,
  useBottleCodes,
  useBottleCodesCsv,
  useCreateBottleCodeExport,
  useVoidBottleCode,
} from "@/lib/erp/hooks";
import { saveBlob } from "@/lib/download";
import { fmtDateTime, fmtNumber } from "@/lib/format";
import { useDebounced } from "@/lib/use-debounced";
import {
  BOTTLE_STATUS,
  EMPTY_CODE_FILTERS,
  EXPORT_STATUS,
  bottleCodeQuery,
  parseSerialRange,
  rangeText,
  replacementText,
  type CodeFilters,
  type RangeValues,
} from "../bottle-codes-model";

// Pendiente de mover a @drinks-on-chain/ui.

const PAGE_SIZE = 20;

const STATUS_OPTIONS = [
  { value: "ALL", label: "Todos los estados" },
  { value: "ACTIVE", label: "Activos" },
  { value: "VOIDED", label: "Anulados" },
];
const IMAGE_OPTIONS = [
  { value: "SVG", label: "SVG (vectorial)" },
  { value: "PNG", label: "PNG" },
];

type Props = {
  lot: Pick<Lot, "id" | "name" | "lotCode" | "bottles" | "dossierStatus">;
  /** Dirección y enología listan, exportan y anulan; el resto solo ve el total. */
  canManage: boolean;
};

/**
 * BottleCodeExport (contrato de la Ola 2 §7): códigos por botella del lote. Tabla paginada por el
 * servidor, exportación CSV y ZIP con los QR para la imprenta (con rango de series), y anulación
 * con motivo, con o sin código de sustitución. Cada exportación y anulación queda en la bitácora.
 */
export function BottleCodeExport({ lot, canManage }: Props) {
  if (!lot.lotCode) {
    return (
      <EmptyState
        title="El lote aún no tiene códigos de botella"
        description="Se generan al embotellar: uno por botella, con su número de serie."
      />
    );
  }
  if (!canManage) {
    return (
      <Alert tone="info" title={`${fmtNumber(lot.bottles ?? 0)} códigos de botella activos`}>
        Los códigos son el antifalsificación de la etiqueta: solo la dirección y enología los listan, exportan o anulan.
      </Alert>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-6">
      <ExportCard lot={lot} />
      <CodesTable lot={lot} />
    </div>
  );
}

function ExportCard({ lot }: { lot: Props["lot"] }) {
  const csv = useBottleCodesCsv();
  const createExport = useCreateBottleCodeExport();
  const [range, setRange] = useState<RangeValues>({ from: "", to: "" });
  const [rangeErrors, setRangeErrors] = useState<Partial<Record<keyof RangeValues, string>>>({});
  const [imageFormat, setImageFormat] = useState<"SVG" | "PNG">("SVG");
  const [exportId, setExportId] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const status = useBottleCodeExport(lot.id, exportId);

  const setField = (key: keyof RangeValues, value: string) => {
    setRange((r) => ({ ...r, [key]: value }));
    setRangeErrors((e) => ({ ...e, [key]: undefined }));
  };
  const readRange = () => {
    setFailure(null);
    const parsed = parseSerialRange(range);
    if (!parsed.ok) {
      setRangeErrors(parsed.errors);
      return null;
    }
    return parsed.range;
  };
  const fail = (err: unknown, title: string) => {
    if (isRuleError(err)) setFailure(err);
    else toast({ title, description: errorMessage(err), tone: "danger" });
  };

  async function downloadCsv() {
    const serials = readRange();
    if (!serials) return;
    try {
      const file = await csv.mutateAsync({ lotId: lot.id, range: serials });
      saveBlob(file.blob, file.filename ?? `codigos-${lot.lotCode}.csv`);
      toast({
        title: "CSV descargado",
        description: `${file.rows != null ? `${fmtNumber(file.rows)} códigos` : "Códigos"} · ${rangeText(serials, lot.bottles)}`,
        tone: "success",
      });
    } catch (err) {
      fail(err, "No se pudo descargar el CSV");
    }
  }

  async function requestZip() {
    const serials = readRange();
    if (!serials) return;
    try {
      const accepted = await createExport.mutateAsync({
        lotId: lot.id,
        body: { format: "ZIP", ...serials, qr: { imageFormat } },
      });
      setExportId(accepted.exportId);
    } catch (err) {
      fail(err, "No se pudo solicitar el ZIP");
    }
  }

  return (
    <Card className="grid gap-4 p-5">
      <CardHeader
        title="Exportar para la imprenta"
        description="CSV con los códigos y su URL, o un ZIP con el CSV y una imagen de QR por botella. Sin rango se exportan todas las series."
      />
      <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Desde la serie" error={rangeErrors.from} help="Opcional.">
          <Input numeric inputMode="numeric" value={range.from} onChange={(e) => setField("from", e.target.value)} />
        </Field>
        <Field label="Hasta la serie" error={rangeErrors.to} help="Opcional.">
          <Input numeric inputMode="numeric" value={range.to} onChange={(e) => setField("to", e.target.value)} />
        </Field>
        <Field label="Imagen del QR" help="Solo para el ZIP.">
          <Select
            value={imageFormat}
            onValueChange={(v) => setImageFormat(v as "SVG" | "PNG")}
            options={IMAGE_OPTIONS}
          />
        </Field>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button
          variant="secondary"
          iconStart={<Download aria-hidden size={16} />}
          loading={csv.isPending}
          onClick={downloadCsv}
        >
          Descargar CSV
        </Button>
        <Button
          variant="secondary"
          iconStart={<FileArchive aria-hidden size={16} />}
          loading={createExport.isPending}
          onClick={requestZip}
        >
          Generar ZIP con los QR
        </Button>
      </div>
      <RuleViolationNotice error={failure} />

      {exportId && (
        <div role="status" aria-live="polite" className="grid gap-2 rounded-md border border-border p-3">
          {status.isError ? (
            <p className="m-0 text-sm text-danger-text">{errorMessage(status.error)}</p>
          ) : !status.data ? (
            <Badge tone="info" className="justify-self-start">
              Generando…
            </Badge>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={EXPORT_STATUS[status.data.status].tone}>{EXPORT_STATUS[status.data.status].label}</Badge>
                <span className="text-sm text-fg-muted">
                  {status.data.format} de {fmtNumber(status.data.rows)} códigos · series{" "}
                  {fmtNumber(status.data.fromSerial)} a {fmtNumber(status.data.toSerial)} · solicitado el{" "}
                  {fmtDateTime(status.data.createdAt)}
                  {status.data.createdBy ? ` por ${status.data.createdBy.fullName}` : ""}
                </span>
              </div>
              {status.data.status === "READY" && status.data.downloadUrl && (
                <p className="m-0 text-sm">
                  <TextLink variant="inline" href={status.data.downloadUrl} target="_blank" rel="noreferrer">
                    Descargar ZIP
                  </TextLink>
                  <span className="text-fg-muted">
                    {" "}
                    · el enlace caduca a los 15 minutos; el archivo, el {fmtDateTime(status.data.expiresAt)}.
                  </span>
                </p>
              )}
              {status.data.status === "FAILED" && (
                <p className="m-0 text-sm text-fg-muted">Vuelve a solicitarlo; si se repite, avisa a soporte.</p>
              )}
            </>
          )}
        </div>
      )}
    </Card>
  );
}

function CodesTable({ lot }: { lot: Props["lot"] }) {
  const [filters, setFilters] = useState<CodeFilters>(EMPTY_CODE_FILTERS);
  const [offset, setOffset] = useState(0);
  const debounced = useDebounced(filters);
  const codes = useBottleCodes(lot.id, bottleCodeQuery(debounced, { limit: PAGE_SIZE, offset }));
  const change = (patch: Partial<CodeFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setOffset(0);
  };
  const filtered = filters.status !== "ALL" || filters.from.trim() !== "" || filters.to.trim() !== "";

  return (
    <Card padding="none">
      <CardHeader
        title="Códigos por botella"
        description={`${fmtNumber(lot.bottles ?? 0)} códigos activos en ${lot.lotCode}. Cada uno identifica una botella y abre su pasaporte.`}
        divided
        className="px-5 pt-5"
      />
      <div className="flex flex-wrap items-end gap-3 px-5 py-4">
        <Select
          aria-label="Filtrar por estado"
          className="w-48"
          value={filters.status}
          onValueChange={(v) => change({ status: v as CodeFilters["status"] })}
          options={STATUS_OPTIONS}
        />
        <Input
          aria-label="Desde la serie (filtro)"
          placeholder="Desde la serie"
          numeric
          inputMode="numeric"
          value={filters.from}
          onChange={(e) => change({ from: e.target.value })}
          wrapperClassName="w-36"
          className="w-36"
        />
        <Input
          aria-label="Hasta la serie (filtro)"
          placeholder="Hasta la serie"
          numeric
          inputMode="numeric"
          value={filters.to}
          onChange={(e) => change({ to: e.target.value })}
          wrapperClassName="w-36"
          className="w-36"
        />
      </div>
      <DataTable<BottleUnit>
        caption={`Códigos de botella de ${lot.lotCode}`}
        captionHidden
        bleed
        data={codes.data?.items ?? []}
        loading={codes.isPending}
        error={
          codes.isError ? { description: errorMessage(codes.error), onRetry: () => void codes.refetch() } : undefined
        }
        getRowId={(u) => u.code}
        manualSorting
        pagination={{ total: codes.data?.total ?? 0, limit: PAGE_SIZE, offset, onOffsetChange: setOffset }}
        columns={[
          { id: "serial", header: "Serie", numeric: true, width: "88px", cell: (u) => fmtNumber(u.serial) },
          {
            id: "code",
            header: "Código",
            cell: (u) => (
              <span className="grid gap-0.5">
                <span className="font-mono font-medium whitespace-nowrap">{u.codeFormatted}</span>
                {replacementText(u) && <span className="text-xs text-fg-muted">{replacementText(u)}</span>}
              </span>
            ),
          },
          {
            id: "status",
            header: "Estado",
            cell: (u) => (
              <span className="grid justify-items-start gap-0.5">
                <Badge tone={BOTTLE_STATUS[u.status].tone}>{BOTTLE_STATUS[u.status].label}</Badge>
                {u.voided && <span className="text-xs text-fg-muted">{u.voided.reason}</span>}
              </span>
            ),
          },
          {
            id: "exports",
            header: "Exportado",
            hideBelow: "lg",
            cell: (u) =>
              u.exportsCount > 0 ? (
                `${fmtNumber(u.exportsCount)} ${u.exportsCount === 1 ? "vez" : "veces"}`
              ) : (
                <span className="text-fg-muted">No</span>
              ),
          },
          {
            id: "url",
            header: "URL del QR",
            hideBelow: "xl",
            cell: (u) => <span className="font-mono text-xs break-all text-fg-muted">{u.qrUrl}</span>,
          },
        ]}
        rowActions={(u) =>
          u.status === "ACTIVE" ? <VoidCodeAction unit={u} dossierClosed={lot.dossierStatus === "CLOSED"} /> : null
        }
        empty={
          <EmptyState
            bare
            title={filtered ? "Ningún código coincide" : "Sin códigos"}
            description={filtered ? "Cambia el estado o el rango de series." : "El lote no tiene códigos de botella."}
          />
        }
      />
    </Card>
  );
}

/** Anular un código (`POST /v1/bottle-codes/{code}/void`), con o sin sustituto de la misma serie. */
function VoidCodeAction({ unit, dossierClosed }: { unit: BottleUnit; dossierClosed: boolean }) {
  const voidCode = useVoidBottleCode();
  const [replace, setReplace] = useState(false);
  return (
    <ReasonAction
      label={
        <>
          Anular<span className="sr-only"> el código {unit.codeFormatted}</span>
        </>
      }
      size="sm"
      variant="tertiary"
      title={`¿Anular el código ${unit.codeFormatted}?`}
      description={`Serie ${fmtNumber(unit.serial)}. El pasaporte de esa botella avisará de que el código fue anulado. No se puede deshacer.`}
      confirmLabel="Sí, anular"
      destructive
      onConfirm={async (reason) => {
        const done = await voidCode.mutateAsync({ code: unit.code, body: { reason, replace } });
        toast({
          title: "Código anulado",
          description: done.voided?.replacedBy
            ? `Serie ${fmtNumber(done.serial)}: lo sustituye un código nuevo.`
            : `Serie ${fmtNumber(done.serial)}, sin sustituto.`,
          tone: "success",
        });
        setReplace(false);
      }}
    >
      <Checkbox
        checked={replace}
        onCheckedChange={(c) => setReplace(c === true)}
        label="Emitir un código de sustitución"
        description={
          dossierClosed
            ? "Con el expediente cerrado un código se puede anular, pero no sustituir: el servidor lo rechazará."
            : "Para una etiqueta dañada: el código nuevo conserva el número de serie."
        }
      />
    </ReasonAction>
  );
}
