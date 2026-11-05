"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { CircleCheck, CircleDashed, Download, Lock } from "lucide-react";
import type { DossierAnchor, Lot } from "@drinks-on-chain/mocks";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  ChainAddress,
  ConfirmDialog,
  ErrorState,
  KeyValueList,
  Skeleton,
  TxStatusBadge,
  toast,
} from "@drinks-on-chain/ui";
import { RuleViolationNotice } from "@/components/rule-violation-notice";
import { errorMessage } from "@/lib/api/errors";
import { isRuleError } from "@/lib/api/rule-violations";
import { ANCHOR_STATUS, CHAIN_NETWORK } from "@/lib/erp/chain";
import { useCloseDossier, useDossier, useDossierCanonical, useDossierPreview, useRefreshErp } from "@/lib/erp/hooks";
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
 * Anclaje del expediente en la red (contrato de la Ola 3 §7): estado, transacción con su enlace al
 * explorador (el que da el backend) y la huella publicada. Mientras la transacción está en vuelo la
 * consulta se repite sola; al confirmarse, el lote pasa a «Anclado en la red».
 */
function DossierAnchorPanel({ anchor }: { anchor: DossierAnchor | null }) {
  if (!anchor) {
    return (
      <section aria-label="Anclaje en la red" className="grid gap-2 border-t border-border pt-4">
        <h3 className="m-0 text-base font-medium">Anclaje en la red</h3>
        <p className="m-0 text-sm text-fg-muted">
          Todavía no se ha registrado. Drinks on Chain publica la huella en la red Stellar después del cierre.
        </p>
      </section>
    );
  }
  const status = ANCHOR_STATUS[anchor.status];
  return (
    <section
      aria-label="Anclaje en la red"
      className="grid gap-3 border-t border-border pt-4"
      data-anchor={anchor.status}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="m-0 text-base font-medium">Anclaje en la red</h3>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>
      {anchor.status === "ANCHORED" ? (
        <p className="m-0 text-sm text-fg-muted">
          La huella del expediente está publicada en la red: cualquiera puede comprobarla en el explorador.
        </p>
      ) : anchor.status === "FAILED" ? (
        <Alert tone="danger" title="El anclaje no se pudo completar">
          Drinks on Chain tiene que reintentarlo. El expediente sigue cerrado y su huella no cambia.
        </Alert>
      ) : (
        <p className="m-0 text-sm text-fg-muted">
          Drinks on Chain está publicando la huella en la red. Suele tardar menos de un minuto; se actualiza solo.
        </p>
      )}
      <KeyValueList
        layout="stacked"
        items={[
          {
            term: "Transacción",
            value: (
              <TxStatusBadge
                status={anchor.transaction.status}
                explorerUrl={anchor.explorerUrl ?? anchor.transaction.explorerUrl}
                lastError={anchor.transaction.lastError}
                attempts={anchor.transaction.attempts}
              />
            ),
          },
          ...(anchor.txHash
            ? [
                {
                  term: "Hash de la transacción",
                  value: <ChainAddress value={anchor.txHash} label="Transacción de anclaje" />,
                },
              ]
            : []),
          { term: "Red", value: CHAIN_NETWORK[anchor.network] },
          ...(anchor.anchoredAt ? [{ term: "Anclado", value: fmtDateTime(anchor.anchoredAt) }] : []),
          { term: "Cuenta de anclaje", value: <ChainAddress value={anchor.account} label="Cuenta de anclaje" /> },
        ]}
      />
    </section>
  );
}

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
  const refresh = useRefreshErp();

  // Al confirmarse (o fallar) el anclaje cambia la etapa del lote: se vuelve a pedir todo una vez.
  const anchorStatus = dossier.data?.anchor?.status ?? null;
  const seenAnchor = useRef(anchorStatus);
  useEffect(() => {
    const before = seenAnchor.current;
    seenAnchor.current = anchorStatus;
    if (before !== null && before !== anchorStatus && (anchorStatus === "ANCHORED" || anchorStatus === "FAILED")) {
      void refresh();
    }
  }, [anchorStatus, refresh]);

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
                value: dossier.data.hash ? (
                  <ChainAddress value={dossier.data.hash} truncate={false} data-testid="dossier-hash" />
                ) : (
                  "—"
                ),
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
                      value: <ChainAddress value={dossier.data.bottleCodes.merkleRoot} truncate={false} />,
                    },
                  ]
                : []),
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
                    <ChainAddress
                      value={preview.data.hashPreview}
                      truncate={false}
                      data-testid="dossier-hash-preview"
                    />
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
        {closed && <DossierAnchorPanel anchor={dossier.data.anchor} />}
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
