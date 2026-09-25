"use client";

import { use } from "react";
import Link from "next/link";
import { Cylinder, FileText } from "lucide-react";
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
  TextLink,
} from "@drinks-on-chain/ui";
import { LabReadingCard } from "@/features/vendimia/components/lab-reading-card";
import { PhytoBadge } from "@/features/vendimia/components/phyto-badge";
import { PhytoDecisionPanel } from "@/features/vendimia/components/phyto-decision";
import { harvestReadings } from "@/features/vendimia/lab-targets";
import { canDecidePhyto } from "@/features/vendimia/phyto";
import { PageChrome } from "@/components/page-chrome";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { useMe } from "@/lib/auth/hooks";
import { useHarvestBatch, useTerroirs } from "@/lib/erp/hooks";
import { DESTINATION, TANK_STATUS } from "@/lib/erp/labels";
import { can } from "@/lib/erp/permissions";
import { fmtDate, fmtDateTime, fmtKg, fmtLiters, fmtNumber } from "@/lib/format";

// 3.2 Análisis y dictamen fitosanitario del lote de vendimia.
export default function HarvestDetailPage({ params }: PageProps<"/vendimia/[id]">) {
  const { id } = use(params);
  const me = useMe();
  const batch = useHarvestBatch(id);
  const terroirs = useTerroirs();
  const h = batch.data;
  const terroir = h ? terroirs.data?.items.find((t) => t.id === h.terroirId) : undefined;
  const tanks = h?.fermentationTanks ?? [];

  const canPhyto = can(me.data, "harvest.phyto");
  const canFill = can(me.data, "tank.create");
  const approved = h?.phytosanitaryStatus === "APPROVED";
  const fillHref = `/vinificacion/nuevo?vendimia=${id}`;
  const fillAction =
    approved && canFill ? (
      <Button asChild iconStart={<Cylinder aria-hidden size={18} />}>
        <Link href={fillHref}>Llenar tanque</Link>
      </Button>
    ) : undefined;

  const notFound = batch.error instanceof ApiError && batch.error.isNotFound;

  return (
    <div className="grid gap-6">
      <PageChrome
        breadcrumbs={[{ label: "Vendimia y laboratorio", href: "/vendimia" }, { label: h?.harvestBatchCode ?? "Lote" }]}
        actions={fillAction}
      />

      {batch.isError ? (
        notFound ? (
          <EmptyState
            title="Lote no encontrado"
            description="El lote de vendimia no existe o pertenece a otra bodega."
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
        <div className="grid gap-6" aria-busy="true">
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
          <header className="grid gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display text-3xl">{h.harvestBatchCode}</h1>
              <PhytoBadge status={h.phytosanitaryStatus} strong />
            </div>
            <p className="m-0 text-sm text-fg-muted">
              {terroir?.parcelName ?? "Parcela"} · Cosecha {h.harvestYear} · {fmtKg(h.netWeightKg)} netos · ingreso el{" "}
              {fmtDateTime(h.intakeDate)}
            </p>
          </header>

          <section aria-labelledby="lab-title" className="grid gap-4">
            <h2 id="lab-title" className="font-ui text-lg font-semibold">
              Análisis preliminar
            </h2>
            <div className="grid gap-4 sm:grid-cols-3">
              {harvestReadings(h).map(({ target, value }) => (
                <LabReadingCard key={target.key} target={target} value={value} />
              ))}
            </div>
          </section>

          <section aria-labelledby="phyto-title" className="grid gap-4">
            <h2 id="phyto-title" className="font-ui text-lg font-semibold">
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
                  canFill ? (
                    <Button asChild size="sm" variant="tertiary">
                      <Link href={fillHref}>Llenar tanque</Link>
                    </Button>
                  ) : undefined
                }
              >
                {canFill
                  ? "Listo para llenar un tanque de fermentación y fijar su destino."
                  : "Listo para que enología llene un tanque de fermentación."}
              </Alert>
            ) : (
              <Alert tone="danger" title="Lote rechazado">
                La uva no entra en producción.
              </Alert>
            )}
          </section>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <Card>
              <CardHeader title="Datos del ingreso" className="mb-4" />
              <KeyValueList
                items={[
                  {
                    term: "Parcela",
                    value: terroir ? (
                      <Link href={`/origen/${terroir.id}`} className="hover:underline">
                        {terroir.parcelName}
                      </Link>
                    ) : (
                      "—"
                    ),
                  },
                  { term: "Cepa", value: terroir?.varietyName ?? "—" },
                  { term: "Cosecha", value: h.harvestYear },
                  { term: "Ingreso", value: fmtDateTime(h.intakeDate) },
                  { term: "Peso bruto", value: fmtKg(h.grossWeightKg) },
                  { term: "Tara", value: fmtKg(h.tareWeightKg) },
                  { term: "Peso neto", value: <strong>{fmtKg(h.netWeightKg)}</strong> },
                  {
                    term: "Temperatura",
                    value: h.temperatureAtIntakeC == null ? "—" : `${fmtNumber(h.temperatureAtIntakeC, 1)} °C`,
                  },
                  {
                    term: "Informe de inspección",
                    value: h.phytoInspectionPdfUrl ? (
                      <TextLink
                        variant="inline"
                        href={h.phytoInspectionPdfUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex gap-1"
                      >
                        <FileText aria-hidden size={16} />
                        Ver informe
                      </TextLink>
                    ) : (
                      "—"
                    ),
                  },
                  { term: "Notas", value: h.notes || "—" },
                  { term: "Registrado", value: fmtDate(h.createdAt) },
                ]}
              />
            </Card>

            <Card>
              <CardHeader title="Tanques vinculados" className="mb-4" />
              {tanks.length === 0 ? (
                <EmptyState
                  bare
                  title="Sin tanques todavía"
                  description={
                    approved
                      ? "El lote está aprobado y puede fermentar."
                      : "Se llena un tanque cuando el lote se aprueba."
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
                        {t.destinationType ? DESTINATION[t.destinationType] : "Sin destino"}
                        {t.volumeFilledLiters != null && ` · ${fmtLiters(t.volumeFilledLiters)}`} · desde{" "}
                        {fmtDate(t.startDate)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
