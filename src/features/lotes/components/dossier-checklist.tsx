"use client";

import Link from "next/link";
import { CircleCheck, CircleDashed, Download, Lock } from "lucide-react";
import type { Lot } from "@drinks-on-chain/mocks";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  ErrorState,
  KeyValueList,
  Skeleton,
  toast,
} from "@drinks-on-chain/ui";
import { RuleViolationNotice } from "@/components/rule-violation-notice";
import { HashText } from "@/features/cuenta/stellar";
import { errorMessage } from "@/lib/api/errors";
import { isRuleError } from "@/lib/api/rule-violations";
import { useCloseDossier, useDossier, useDossierCanonical, useDossierPreview } from "@/lib/erp/hooks";
import { saveBlob } from "@/lib/download";
import { fmtDateTime, fmtNumber } from "@/lib/format";
import { canonicalFilename, progressText, requirementViews } from "../dossier-model";
import { actorText } from "../lot-timeline";

// Pendiente de mover a @drinks-on-chain/ui.

type Props = {
  lot: Pick<Lot, "id" | "name" | "reference" | "lotCode">;
  /** Dirección y enología cierran el expediente; el resto lo consulta. */
  canClose: boolean;
};

/**
 * DossierChecklist (contrato de la Ola 2 §10): requisitos del expediente del lote tal como los
 * evalúa el servidor, cierre con confirmación explícita (fija la huella SHA-256 del JSON canónico;
 * después el lote ya no admite cambios) y descarga de los bytes exactos que se hashean.
 */
export function DossierChecklist({ lot, canClose }: Props) {
  const preview = useDossierPreview(lot.id);
  const dossier = useDossier(lot.id);
  const close = useCloseDossier();
  const canonical = useDossierCanonical();

  if (preview.isError || dossier.isError) {
    const failed = preview.isError ? preview : dossier;
    return (
      <ErrorState
        description={errorMessage(failed.error)}
        onRetry={() => void Promise.all([preview.refetch(), dossier.refetch()])}
        retrying={preview.isFetching || dossier.isFetching}
      />
    );
  }
  if (!preview.data || !dossier.data) return <Skeleton shape="block" className="h-80" />;

  const closed = dossier.data.status === "CLOSED";
  const requirements = requirementViews(lot.id, preview.data.requirements);

  async function download() {
    try {
      const file = await canonical.mutateAsync(lot.id);
      saveBlob(file.blob, file.filename ?? canonicalFilename(lot));
      toast({
        title: "JSON canónico descargado",
        description: "Son los bytes exactos sobre los que se calcula la huella.",
        tone: "success",
      });
    } catch (err) {
      toast({ title: "No se pudo descargar el expediente", description: errorMessage(err), tone: "danger" });
    }
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Card className="grid grid-cols-1 gap-4">
        <CardHeader
          title="Requisitos del expediente"
          description={
            closed
              ? "Los comprobó el servidor al cerrar el expediente."
              : "Los comprueba el servidor. Con todos cumplidos, el expediente se puede cerrar."
          }
          action={<Badge tone={preview.data.ready ? "success" : "warning"}>{progressText(requirements)}</Badge>}
        />
        <ul aria-label="Requisitos del expediente" className="m-0 grid list-none gap-0 p-0">
          {requirements.map((r) => (
            <li
              key={r.key}
              data-requirement={r.key}
              data-met={r.met}
              className="flex flex-wrap items-start gap-3 border-b border-border py-3 last:border-b-0"
            >
              {r.met ? (
                <CircleCheck aria-hidden size={20} className="mt-0.5 shrink-0 text-success" />
              ) : (
                <CircleDashed aria-hidden size={20} className="mt-0.5 shrink-0 text-warning" />
              )}
              <div className="grid min-w-0 flex-1 gap-0.5">
                <span className="font-medium">
                  {r.title}
                  <span className="sr-only">{r.met ? ": cumplido" : ": pendiente"}</span>
                </span>
                <span className="text-sm text-fg-muted">{r.message}</span>
              </div>
              {r.action && !closed && (
                <Button asChild size="sm" variant="tertiary">
                  <Link href={r.action.href}>{r.action.label}</Link>
                </Button>
              )}
            </li>
          ))}
        </ul>

        <RuleViolationNotice error={close.error} />

        {!closed && canClose && (
          <div className="grid justify-items-start gap-2 border-t border-border pt-4">
            <ConfirmDialog
              title={`¿Cerrar el expediente de ${lot.name}?`}
              description="Se fija la huella del expediente con todos sus registros. Después el lote no admite análisis, correcciones ni códigos de sustitución. No se puede deshacer."
              confirmLabel="Sí, cerrar el expediente"
              trigger={
                <Button iconStart={<Lock aria-hidden size={16} />} loading={close.isPending}>
                  Cerrar el expediente
                </Button>
              }
              onConfirm={async () => {
                try {
                  const done = await close.mutateAsync(lot.id);
                  toast({
                    title: "Expediente cerrado",
                    description: done.hash ? `Huella ${done.hash.slice(0, 12)}…` : undefined,
                    tone: "success",
                  });
                } catch (err) {
                  // Una regla (requisitos sin cumplir, ya cerrado) se explica con su aviso.
                  if (!isRuleError(err)) throw new Error(errorMessage(err), { cause: err });
                }
              }}
            />
            {!preview.data.ready && (
              <p className="m-0 text-sm text-fg-muted">
                Aún hay requisitos pendientes: si lo intentas, el servidor lo rechazará y dirá cuáles.
              </p>
            )}
          </div>
        )}
        {!closed && !canClose && (
          <p className="m-0 border-t border-border pt-4 text-sm text-fg-muted">
            El expediente lo cierran enología o la dirección de la bodega.
          </p>
        )}
      </Card>

      <Card className="grid grid-cols-1 gap-4">
        <CardHeader
          title="Huella del expediente"
          description="SHA-256 del JSON canónico (RFC 8785) con todos los registros del lote."
          action={<Badge tone={closed ? "success" : "neutral"}>{closed ? "Cerrado" : "Abierto"}</Badge>}
        />
        {closed ? (
          <KeyValueList
            layout="stacked"
            items={[
              {
                term: "Huella (SHA-256)",
                value: dossier.data.hash ? <HashText value={dossier.data.hash} full label="Copiar huella" /> : "—",
              },
              { term: "Algoritmo", value: <code className="font-mono text-sm">{dossier.data.algorithm}</code> },
              {
                term: "Cerrado",
                value: dossier.data.closedAt
                  ? `${fmtDateTime(dossier.data.closedAt)}${dossier.data.closedBy ? ` · ${actorText(dossier.data.closedBy)}` : ""}`
                  : "—",
              },
              ...(dossier.data.bottleCodes
                ? [
                    {
                      term: `Raíz Merkle de los ${fmtNumber(dossier.data.bottleCodes.count)} códigos de botella`,
                      value: <HashText value={dossier.data.bottleCodes.merkleRoot} full label="Copiar raíz Merkle" />,
                    },
                  ]
                : []),
              { term: "Anclaje en Stellar", value: "Pendiente: llega con la Ola 3." },
            ]}
          />
        ) : (
          <>
            <KeyValueList
              layout="stacked"
              items={[
                {
                  term: "Huella si se cerrara ahora",
                  value: preview.data.hashPreview ? (
                    <HashText value={preview.data.hashPreview} full label="Copiar huella provisional" />
                  ) : (
                    <span className="text-fg-muted">Se calcula cuando el lote está embotellado.</span>
                  ),
                },
                { term: "Algoritmo", value: <code className="font-mono text-sm">{dossier.data.algorithm}</code> },
              ]}
            />
            <Alert tone="info">
              La huella cambia con cada registro hasta el cierre. Los códigos de botella no van en claro: entra su raíz
              Merkle.
            </Alert>
          </>
        )}
        <Button
          variant="secondary"
          className="justify-self-start"
          iconStart={<Download aria-hidden size={16} />}
          loading={canonical.isPending}
          onClick={download}
        >
          Descargar JSON canónico
        </Button>
      </Card>
    </div>
  );
}
