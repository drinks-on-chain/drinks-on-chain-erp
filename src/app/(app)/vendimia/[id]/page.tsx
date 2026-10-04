"use client";

import { use } from "react";
import Link from "next/link";
import { Cylinder } from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  KeyValueList,
  Skeleton,
  Tag,
} from "@drinks-on-chain/ui";
import { DoEvaluationView } from "@/features/lotes/components/do-evaluation";
import { MaturityPanel } from "@/features/vendimia/components/maturity-panel";
import { PhytoBadge } from "@/features/vendimia/components/phyto-badge";
import { PhytoDecisionPanel } from "@/features/vendimia/components/phyto-decision";
import { PhytoHistory } from "@/features/vendimia/components/phyto-history";
import { canDecidePhyto } from "@/features/vendimia/phyto";
import { PageChrome } from "@/components/page-chrome";
import { ScreenTitle } from "@/components/screen-title";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { useMe } from "@/lib/auth/hooks";
import { useHarvestBatch, useLot } from "@/lib/erp/hooks";
import { DESTINATION, TANK_STATUS } from "@/lib/erp/labels";
import { can } from "@/lib/erp/permissions";
import { fmtDate, fmtDateTime, fmtKg, fmtLiters, fmtNumber } from "@/lib/format";

// Ficha del pesaje (contrato de la Ola 2 §3): pesaje, análisis de madurez aparte, dictamen
// fitosanitario con historial y rol, lote al que pertenece (o uva sin lote) y sus tanques.
export default function HarvestDetailPage({ params }: PageProps<"/vendimia/[id]">) {
  const { id } = use(params);
  const me = useMe();
  const batch = useHarvestBatch(id);
  const h = batch.data;
  const lot = useLot(h?.lotId ?? "", !!h?.lotId);
  const tanks = h?.fermentationTanks ?? [];
  const lotLabel = lot.data ? `${lot.data.name} · ${lot.data.reference}` : (h?.harvestBatchCode ?? "Pesaje");
  // La parcela tal como era al pesar; si el registro no la trae, la actual.
  const parcel = h?.terroirSnapshot ?? h?.terroir ?? null;

  const canPhyto = can(me.data, "harvest.phyto");
  const canFill = can(me.data, "tank.create");
  const approved = h?.phytosanitaryStatus === "APPROVED";
  const available = h?.availableKg ?? null;
  const fillHref = `/vinificacion/nuevo?vendimia=${id}`;
  const fillAction =
    approved && canFill && (available === null || available > 0) ? (
      <Button asChild iconStart={<Cylinder aria-hidden size={18} />}>
        <Link href={fillHref}>Llenar tanque</Link>
      </Button>
    ) : undefined;

  const notFound = batch.error instanceof ApiError && batch.error.isNotFound;

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageChrome
        breadcrumbs={[
          { label: "Vendimia y laboratorio", href: "/vendimia" },
          { label: h?.harvestBatchCode ?? "Pesaje" },
        ]}
        actions={fillAction}
      />

      {(batch.isError || !h) && <ScreenTitle busy={!batch.isError}>Pesaje</ScreenTitle>}
      {batch.isError ? (
        notFound ? (
          <EmptyState
            title="Pesaje no encontrado"
            description="El pesaje no existe o pertenece a otra bodega."
            action={
              <Button asChild variant="secondary">
                <Link href="/vendimia">Volver a vendimia</Link>
              </Button>
            }
          />
        ) : (
          <ErrorState
            description={errorMessage(batch.error)}
            onRetry={() => batch.refetch()}
            retrying={batch.isFetching}
          />
        )
      ) : !h ? (
        <div className="grid grid-cols-1 gap-6" aria-busy="true">
          <Skeleton className="h-10 w-96" />
          <div className="grid gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} shape="block" className="h-40" />
            ))}
          </div>
          <Skeleton shape="block" className="h-64" />
        </div>
      ) : (
        <>
          <header className="grid grid-cols-1 gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display text-3xl">{h.harvestBatchCode}</h1>
              <PhytoBadge status={h.phytosanitaryStatus} strong />
              {!h.lotId && <Tag>Uva sin lote</Tag>}
              {h.lateEntry && (
                <Badge tone="warning" title="Registrado más de 7 días después del ingreso">
                  Registro tardío
                </Badge>
              )}
            </div>
            <p className="m-0 text-sm text-fg-muted">
              {parcel?.parcelName ?? "Parcela"} · Cosecha {h.harvestYear} · {fmtKg(h.netWeightKg)} netos · ingreso el{" "}
              {fmtDateTime(h.intakeDate)}
            </p>
          </header>

          {!h.lotId && (
            <Alert tone="info" title="Uva recibida sin lote">
              Se asigna a un lote al llenar el tanque: allí se elige un lote existente o se crea uno nuevo.
            </Alert>
          )}

          <MaturityPanel batch={h} canAnalyze={can(me.data, "harvest.maturity")} lotLabel={lotLabel} />

          <section aria-labelledby="phyto-title" className="grid grid-cols-1 gap-4">
            <h2 id="phyto-title" className="m-0 font-ui text-lg font-semibold">
              Dictamen fitosanitario
            </h2>
            {canDecidePhyto(h.phytosanitaryStatus) ? (
              canPhyto ? (
                <PhytoDecisionPanel batch={h} />
              ) : (
                <Alert tone="info" title="Pendiente de dictamen">
                  Lo decide agronomía o enología tras la inspección.
                </Alert>
              )
            ) : approved ? (
              <Alert
                tone="success"
                title="Lote aprobado"
                action={
                  fillAction ? (
                    <Button asChild size="sm" variant="tertiary">
                      <Link href={fillHref}>Llenar tanque</Link>
                    </Button>
                  ) : undefined
                }
              >
                {available === 0
                  ? "Toda la uva de este pesaje ya entró a tanques."
                  : canFill
                    ? "Lista para llenar un tanque de fermentación."
                    : "Lista para que enología llene un tanque de fermentación."}
              </Alert>
            ) : (
              <Alert tone="danger" title="Lote rechazado">
                La uva no entra en producción.
              </Alert>
            )}
            <PhytoHistory decisions={h.phytoDecisions} lotId={h.lotId} lotLabel={lotLabel} />
          </section>

          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <Card>
              <CardHeader title="Datos del ingreso" className="mb-4" />
              <KeyValueList
                items={[
                  {
                    term: "Lote",
                    value: h.lotId ? (
                      <Link href={`/lotes/${h.lotId}`} className="hover:underline">
                        {lot.data ? `${lot.data.name} · ${lot.data.reference}` : "Ver lote"}
                      </Link>
                    ) : (
                      "Sin lote"
                    ),
                  },
                  {
                    term: "Parcela",
                    value: (
                      <Link href={`/origen/${h.terroirId}`} className="hover:underline">
                        {parcel?.parcelName ?? "Ver parcela"}
                      </Link>
                    ),
                  },
                  { term: "Cepa al pesar", value: parcel?.varietyName ?? "—" },
                  {
                    term: "Altitud al pesar",
                    value: parcel ? `${fmtNumber(parcel.altitudeMasl)} m s. n. m.` : "—",
                  },
                  { term: "Cosecha", value: h.harvestYear },
                  { term: "Ingreso", value: fmtDateTime(h.intakeDate) },
                  { term: "Peso bruto", value: fmtKg(h.grossWeightKg) },
                  { term: "Tara", value: fmtKg(h.tareWeightKg) },
                  { term: "Peso neto", value: <strong>{fmtKg(h.netWeightKg)}</strong> },
                  ...(available !== null ? [{ term: "Disponible para tanque", value: fmtKg(available) }] : []),
                  {
                    term: "Temperatura",
                    value: h.temperatureAtIntakeC == null ? "—" : `${fmtNumber(h.temperatureAtIntakeC, 1)} °C`,
                  },
                  { term: "Notas", value: h.notes || "—" },
                  { term: "Registrado", value: fmtDate(h.createdAt) },
                ]}
              />
            </Card>

            <div className="grid grid-cols-1 gap-6">
              {h.doEvaluation && (
                <Card className="grid grid-cols-1 gap-3">
                  <CardHeader title="Denominación de origen" />
                  <DoEvaluationView evaluation={h.doEvaluation} />
                </Card>
              )}

              <Card>
                <CardHeader title="Tanques vinculados" className="mb-4" />
                {tanks.length === 0 ? (
                  <EmptyState
                    bare
                    title="Sin tanques todavía"
                    description={
                      approved
                        ? "La uva está aprobada y puede fermentar."
                        : "La uva entra a un tanque cuando se aprueba."
                    }
                    action={fillAction}
                  />
                ) : (
                  <ul className="m-0 grid list-none gap-3 p-0">
                    {tanks.map((t) => (
                      <li key={t.id} className="grid gap-1 rounded-md border border-border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <Link href={`/vinificacion/${t.id}`} className="font-medium hover:underline">
                            {t.tankCode}
                          </Link>
                          <Badge tone={TANK_STATUS[t.status].tone}>{TANK_STATUS[t.status].label}</Badge>
                        </div>
                        <p className="m-0 text-sm text-fg-muted">
                          {t.destinationType ? DESTINATION[t.destinationType] : "Destino por decidir"}
                          {t.volumeFilledLiters != null && ` · ${fmtLiters(t.volumeFilledLiters)}`} · desde{" "}
                          {fmtDate(t.startDate)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
