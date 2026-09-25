"use client";

import { use } from "react";
import Link from "next/link";
import { FileText, Pencil, Scale } from "lucide-react";
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  KeyValueList,
  Skeleton,
  Tag,
  TextLink,
} from "@drinks-on-chain/ui";
import { PageChrome } from "@/components/page-chrome";
import { DoBadge } from "@/features/origen/components/do-badge";
import { ParcelMap } from "@/features/origen/components/parcel-map";
import { doEligibility, doReasonText } from "@/features/origen/do-eligibility";
import { HarvestBatchTable } from "@/features/vendimia/components/harvest-batch-table";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { useMe } from "@/lib/auth/hooks";
import { useHarvestBatchesIf, useTerroir } from "@/lib/erp/hooks";
import { can } from "@/lib/erp/permissions";
import { fmtDate, fmtNumber } from "@/lib/format";

const orDash = (v: string | null | undefined) => (v && v.trim() ? v : "—");
const coord = (n: number | null | undefined) => (n == null ? "—" : n.toFixed(4).replace(".", ","));

// 2.2 Ficha de terroir: datos de la parcela, aptitud D.O., certificado y lotes históricos.
export default function TerroirDetailPage({ params }: PageProps<"/origen/[id]">) {
  const { id } = use(params);
  const me = useMe();
  const terroir = useTerroir(id);
  const t = terroir.data;
  // El detalle trae los lotes históricos; si el backend no los incluye, se piden aparte.
  const fallback = useHarvestBatchesIf({ terroirId: id }, !!t && !t.harvestBatches);
  const harvests = t?.harvestBatches ?? fallback.data?.items;
  const sortedHarvests = harvests ? [...harvests].sort((a, b) => b.intakeDate.localeCompare(a.intakeDate)) : [];

  const canWeigh = can(me.data, "harvest.create");
  const weighAction = canWeigh ? (
    <Button asChild iconStart={<Scale aria-hidden size={18} />}>
      <Link href={`/vendimia/pesaje?terroir=${id}`}>Registrar pesaje</Link>
    </Button>
  ) : undefined;

  const notFound = terroir.error instanceof ApiError && terroir.error.isNotFound;
  const eligibility = t ? doEligibility(t) : null;

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageChrome
        breadcrumbs={[{ label: "Origen y terroirs", href: "/origen" }, { label: t?.parcelName ?? "Terroir" }]}
        actions={
          t ? (
            <>
              {can(me.data, "terroir.write") && (
                <Button asChild variant="secondary" iconStart={<Pencil aria-hidden size={16} />}>
                  <Link href={`/origen/${id}/editar`}>Editar</Link>
                </Button>
              )}
              {weighAction}
            </>
          ) : undefined
        }
      />

      {terroir.isError ? (
        notFound ? (
          <EmptyState
            title="Terroir no encontrado"
            description="La parcela no existe o pertenece a otra bodega."
            action={
              <Button asChild variant="secondary">
                <Link href="/origen">Volver al directorio</Link>
              </Button>
            }
          />
        ) : (
          <ErrorState
            description={errorMessage(terroir.error)}
            onRetry={() => terroir.refetch()}
            retrying={terroir.isFetching}
          />
        )
      ) : !t || !eligibility ? (
        <div className="grid grid-cols-1 gap-6" aria-busy="true">
          <Skeleton className="h-10 w-80" />
          <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Skeleton shape="block" className="h-80" />
            <Skeleton shape="block" className="h-80" />
          </div>
        </div>
      ) : (
        <>
          <header className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-3xl">{t.parcelName}</h1>
            <DoBadge {...t} />
            {!t.isActive && <Tag>Inactiva</Tag>}
          </header>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Card>
              <CardHeader title="Ficha de la parcela" className="mb-4" />
              <KeyValueList
                items={[
                  { term: "Código catastral", value: orDash(t.cadastreCode) },
                  { term: "Superficie", value: `${fmtNumber(t.surfaceHectares, 1)} ha` },
                  { term: "Altitud", value: `${fmtNumber(t.altitudeMasl)} m s. n. m.` },
                  { term: "Materia prima", value: <span className="capitalize">{t.rawMaterialType}</span> },
                  { term: "Cepa", value: t.varietyName },
                  { term: "Suelo", value: orDash(t.soilType) },
                  { term: "Riego", value: orDash(t.irrigationSystem) },
                  { term: "Latitud / longitud", value: `${coord(t.latitude)} / ${coord(t.longitude)}` },
                  { term: "Estado", value: t.isActive ? "Activa" : "Inactiva" },
                  { term: "Alta", value: fmtDate(t.createdAt) },
                ]}
              />
            </Card>

            <div className="grid content-start gap-6">
              <Card className="grid grid-cols-1 gap-3">
                <ParcelMap geometry={t.geographicPolygonGeojson} className="h-44" />
                <p className="m-0 text-xs text-fg-subtle">
                  {t.geographicPolygonGeojson ? "Silueta del polígono GeoJSON registrado." : "Sin polígono registrado."}
                </p>
              </Card>

              <Card className="grid grid-cols-1 gap-3">
                <CardHeader title="Denominación de origen" />
                <DoBadge {...t} explain className="justify-self-start" />
                {!eligibility.eligible && (
                  <ul className="m-0 grid list-disc gap-1 pl-5 text-sm text-fg-muted">
                    {eligibility.reasons.map((r) => (
                      <li key={r}>{doReasonText(r)}</li>
                    ))}
                  </ul>
                )}
                <KeyValueList
                  items={[
                    { term: "Aptitud declarada", value: t.isDoEligible ? "Sí" : "No" },
                    { term: "Tipo de D.O.", value: orDash(t.doType) },
                  ]}
                />
                {t.doCertificateUrl ? (
                  <TextLink
                    variant="inline"
                    href={t.doCertificateUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex gap-1"
                  >
                    <FileText aria-hidden size={16} />
                    Ver certificado D.O.
                  </TextLink>
                ) : (
                  <p className="m-0 text-sm text-fg-subtle">Sin certificado adjunto.</p>
                )}
              </Card>
            </div>
          </div>

          <Card padding="none">
            <CardHeader
              title="Lotes de vendimia"
              description="Ingresos históricos de uva de esta parcela."
              divided
              className="px-5 pt-5"
            />
            {fallback.isError ? (
              <ErrorState
                bare
                description={errorMessage(fallback.error)}
                onRetry={() => fallback.refetch()}
                retrying={fallback.isFetching}
              />
            ) : (
              <HarvestBatchTable
                caption={`Lotes de vendimia de ${t.parcelName}`}
                data={sortedHarvests}
                loading={!harvests}
                empty={
                  <EmptyState
                    bare
                    title="Sin ingresos todavía"
                    description="Cuando llegue uva de esta parcela, regístrala en el pesaje."
                    action={weighAction}
                  />
                }
              />
            )}
          </Card>
        </>
      )}
    </div>
  );
}
