"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Lot } from "@drinks-on-chain/mocks";
import {
  Alert,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  KeyValueList,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tag,
  toast,
} from "@drinks-on-chain/ui";
import { PageChrome } from "@/components/page-chrome";
import { ReasonAction } from "@/components/reason-action";
import { ScreenTitle } from "@/components/screen-title";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { useMe } from "@/lib/auth/hooks";
import { useDiscardLot, useLegacyLotId, useLot, useLotBalance, useTerroirs } from "@/lib/erp/hooks";
import { LOT_LAB_STATUS, LOT_PRODUCT } from "@/lib/erp/labels";
import { env } from "@/lib/env";
import { can } from "@/lib/erp/permissions";
import { fmtDate, fmtDateTime, fmtNumber } from "@/lib/format";
import { LotTokenization } from "@/features/tokenizacion/lot-tokenization";
import { BottleCodeExport } from "./components/bottle-code-export";
import { ComplianceIssues } from "./components/compliance-issues";
import { DoEvaluationView } from "./components/do-evaluation";
import { DossierChecklist } from "./components/dossier-checklist";
import { EstimateEditor } from "./components/estimate-editor";
import { LotAttachments } from "./components/lot-attachments";
import { LotCorrections } from "./components/lot-corrections";
import { LotGraphView } from "./components/lot-graph";
import { LotLab } from "./components/lot-lab";
import { LotBalanceChart } from "./components/lot-balance-chart";
import { LotLocks } from "./components/lot-locks";
import { LotRecords } from "./components/lot-records";
import { LotStageBadge } from "./components/lot-stage-badge";
import { RulesList } from "./components/rules-list";
import {
  LOT_TABS,
  LOT_TAB_LABEL,
  isLotTab,
  isTerminalStage,
  nextStep,
  snapshotItems,
  stageView,
  type LotTab,
} from "./lot-model";
import { LotTimeline, actorText } from "./lot-timeline";

const CRUMBS = [{ label: "Lotes", href: "/lotes" }];

function Frame({ label, busy = false, children }: { label: string; busy?: boolean; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-6" aria-busy={busy || undefined}>
      <PageChrome breadcrumbs={[...CRUMBS, { label }]} />
      <ScreenTitle busy={busy}>Lote</ScreenTitle>
      {children}
    </div>
  );
}

/**
 * Ficha del lote (`GET /v1/lots/{id}`). Los enlaces antiguos llevaban el id del pesaje
 * (`/lotes/{harvestBatchId}`, contrato §16.3): si no hay lote con ese id, se busca el pesaje y se
 * redirige a su lote.
 */
export function LotDetail({ id, initialTab }: { id: string; initialTab?: LotTab }) {
  const router = useRouter();
  const lot = useLot(id);
  const missing = lot.error instanceof ApiError && (lot.error.isNotFound || lot.error.isValidation);
  const legacy = useLegacyLotId(id, missing);

  useEffect(() => {
    if (legacy.data) router.replace(`/lotes/${legacy.data}`);
  }, [legacy.data, router]);

  if (lot.data) return <LotSheet lot={lot.data} initialTab={initialTab} />;

  if (lot.isError && !missing) {
    return (
      <Frame label="Lote">
        <ErrorState description={errorMessage(lot.error)} onRetry={() => lot.refetch()} retrying={lot.isFetching} />
      </Frame>
    );
  }
  if (missing && legacy.isError) {
    return (
      <Frame label="Lote">
        <ErrorState
          description={errorMessage(legacy.error)}
          onRetry={() => legacy.refetch()}
          retrying={legacy.isFetching}
        />
      </Frame>
    );
  }
  if (missing && legacy.isSuccess && !legacy.data) {
    return (
      <Frame label="Lote">
        <EmptyState
          title="Lote no encontrado"
          description="No existe o pertenece a otra bodega."
          action={
            <Button asChild variant="secondary">
              <Link href="/lotes">Volver a lotes</Link>
            </Button>
          }
        />
      </Frame>
    );
  }
  return (
    <Frame label="Lote" busy>
      <Skeleton className="h-10 w-72" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Skeleton shape="block" className="h-96" />
        <Skeleton shape="block" className="h-64" />
      </div>
    </Frame>
  );
}

function LotSheet({ lot, initialTab }: { lot: Lot; initialTab?: LotTab }) {
  const me = useMe();
  const [tab, setTab] = useState<LotTab>(initialTab ?? "resumen");
  const step = nextStep(lot);
  const canStep = step && can(me.data, step.action);
  const stage = stageView(lot);
  // Cada rol ve las secciones que el servidor le deja leer (balance: sin operario; códigos:
  // el total es de todos, la lista solo de dirección y enología).
  const canBalance = can(me.data, "lot.balance.read");
  // Tokenización (1K): detrás de la bandera; la leen dirección, enología y contabilidad.
  const canTokenization = env.tokenization && can(me.data, "tokenization.read");
  const tabs = LOT_TABS.filter((t) => (t !== "balance" || canBalance) && (t !== "tokenizacion" || canTokenization));

  const changeTab = (value: string) => {
    if (!isLotTab(value)) return;
    setTab(value);
    // La pestaña queda en la URL (enlazable) sin navegar ni volver a pedir datos.
    const url = new URL(window.location.href);
    if (value === "resumen") url.searchParams.delete("pestana");
    else url.searchParams.set("pestana", value);
    window.history.replaceState(null, "", url);
  };

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageChrome
        breadcrumbs={[...CRUMBS, { label: lot.reference }]}
        actions={
          canStep ? (
            <Button asChild>
              <Link href={step.href}>{step.label}</Link>
            </Button>
          ) : undefined
        }
      />
      <header className="grid grid-cols-1 gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl">{lot.name}</h1>
          <LotStageBadge lot={lot} />
          {lot.productType ? <Tag>{LOT_PRODUCT[lot.productType]}</Tag> : <Tag>Tipo por decidir</Tag>}
        </div>
        <p className="m-0 flex flex-wrap gap-x-3 gap-y-1 text-sm text-fg-muted">
          <span>
            Referencia <span className="font-mono text-fg">{lot.reference}</span>
          </span>
          {lot.lotCode && (
            <span>
              Código de lote <span className="font-mono text-fg">{lot.lotCode}</span>
            </span>
          )}
          <span>Añada {lot.harvestYear}</span>
          {stage.detail && <span>{stage.detail}</span>}
        </p>
      </header>

      {lot.discarded && (
        <Alert tone="neutral" title={`Lote descartado el ${fmtDate(lot.discarded.at)}`}>
          {lot.discarded.reason} · {actorText(lot.discarded.by)}. Es de solo lectura.
        </Alert>
      )}
      {lot.stage === "REJECTED" && (
        <Alert tone="danger" title="Lote rechazado">
          Todos sus pesajes tienen dictamen fitosanitario negativo. Es de solo lectura.
        </Alert>
      )}

      <ComplianceIssues issues={lot.complianceIssues} />

      <Tabs value={tabs.includes(tab) ? tab : "resumen"} onValueChange={changeTab}>
        <TabsList aria-label="Secciones del lote">
          {tabs.map((t) => (
            <TabsTrigger key={t} value={t}>
              {LOT_TAB_LABEL[t]}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="resumen">
          <LotSummaryTab lot={lot} note={step?.note ?? null} canWrite={can(me.data, "lot.write")} />
        </TabsContent>
        {canBalance && (
          <TabsContent value="balance">
            <LotBalanceTab lot={lot} />
          </TabsContent>
        )}
        <TabsContent value="codigos">
          <BottleCodeExport lot={lot} canManage={can(me.data, "bottleCodes.manage")} />
        </TabsContent>
        <TabsContent value="laboratorio">
          <LotLab lot={lot} />
        </TabsContent>
        <TabsContent value="expediente">
          <DossierChecklist lot={lot} canClose={can(me.data, "dossier.close")} />
        </TabsContent>
        {canTokenization && (
          <TabsContent value="tokenizacion">
            <LotTokenization lot={lot} />
          </TabsContent>
        )}
        <TabsContent value="linea-de-tiempo">
          <Card className="grid grid-cols-1 gap-4">
            <CardHeader
              title="Línea de tiempo"
              description="Cada registro del lote, con su fecha declarada y quién lo hizo."
            />
            <LotTimeline lotId={lot.id} />
          </Card>
        </TabsContent>
        <TabsContent value="trazabilidad">
          <Card className="grid grid-cols-1 gap-5">
            <CardHeader
              title="Trazabilidad del lote"
              description="De la parcela a la botella, con las cantidades que pasan de una etapa a otra y las cifras registradas en cada una."
            />
            <LotGraphView lot={lot} />
          </Card>
        </TabsContent>
        <TabsContent value="correcciones">
          <LotCorrections lot={lot} />
        </TabsContent>
        <TabsContent value="archivos">
          <LotAttachments lot={lot} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** Conciliación kilos → litros → botellas (`GET /v1/lots/{id}/balance`). */
function LotBalanceTab({ lot }: { lot: Lot }) {
  const balance = useLotBalance(lot.id);
  return (
    <Card className="grid grid-cols-1 gap-4">
      <CardHeader
        title="Balance del lote"
        description="De los kilos de uva a las botellas, con la merma de cada etapa. Lo calcula el servidor con los registros del lote."
      />
      {balance.isPending ? (
        <Skeleton shape="block" className="h-40" />
      ) : balance.isError ? (
        <ErrorState
          bare
          description={errorMessage(balance.error)}
          onRetry={() => balance.refetch()}
          retrying={balance.isFetching}
        />
      ) : (
        <LotBalanceChart balance={balance.data} />
      )}
    </Card>
  );
}

/** Descartar el lote (`POST /v1/lots/{id}/discard`): con motivo; queda de solo lectura. */
function DiscardLot({ lot }: { lot: Lot }) {
  const discard = useDiscardLot();
  return (
    <ReasonAction
      label="Descartar lote"
      title={`¿Descartar ${lot.name}?`}
      description="El lote deja de admitir registros y sale de la producción. No se puede deshacer; el motivo queda en la línea de tiempo."
      confirmLabel="Sí, descartar"
      destructive
      variant="tertiary"
      onConfirm={async (reason) => {
        await discard.mutateAsync({ id: lot.id, reason });
        toast({ title: "Lote descartado", description: lot.reference, tone: "success" });
      }}
    />
  );
}

function LotSummaryTab({ lot, note, canWrite }: { lot: Lot; note: string | null; canWrite: boolean }) {
  const terroirs = useTerroirs();
  const terroirNames = useMemo(
    () => Object.fromEntries((terroirs.data?.items ?? []).map((t) => [t.id, t.parcelName])),
    [terroirs.data],
  );
  const rules = useMemo(() => snapshotItems(lot.rules), [lot.rules]);
  const lab = LOT_LAB_STATUS[lot.labStatus];
  const bottles =
    lot.bottles != null
      ? `${fmtNumber(lot.bottles)} embotelladas`
      : lot.projectedBottles != null
        ? `≈ ${fmtNumber(lot.projectedBottles)} (proyección del servidor)`
        : "Sin proyección todavía";

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="grid grid-cols-1 gap-6">
        <Card className="grid grid-cols-1 gap-4">
          <CardHeader
            title="Candados"
            description="Los evalúa el servidor con las reglas del lote y su propio reloj."
          />
          {lot.locks.length > 0 ? (
            <LotLocks locks={lot.locks} />
          ) : (
            <p className="m-0 text-sm text-fg-muted">
              {note ?? "El lote no tiene candados: aparecen al iniciar la crianza o al cerrar la destilación."}
            </p>
          )}
          {lot.locks.length > 0 && note && <p className="m-0 text-sm text-fg-muted">{note}</p>}
          {lot.estimatedReadyDate && (
            <p className="m-0 text-sm text-fg-muted">
              Fecha estimada de salida: <span className="font-medium text-fg">{fmtDate(lot.estimatedReadyDate)}</span>
              {lot.estimatedReadyBasis === "LOCK" ? " (según los candados)" : " (declarada por la bodega)"}
            </p>
          )}
        </Card>

        <Card className="grid grid-cols-1 gap-2">
          <CardHeader title="Registros del lote" description="De la parcela a la botella." />
          <LotRecords lotId={lot.id} />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <Card className="grid grid-cols-1 gap-4">
          <CardHeader title="Datos del lote" />
          <KeyValueList
            items={[
              { term: "Tipo", value: lot.productType ? LOT_PRODUCT[lot.productType] : "Se decide en la bifurcación" },
              {
                term: "Botellas estimadas",
                value: (
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    {lot.estimatedBottles != null ? fmtNumber(lot.estimatedBottles) : "Sin estimación"}
                    {canWrite && !isTerminalStage(lot.stage) && <EstimateEditor lot={lot} />}
                  </span>
                ),
              },
              { term: "Botellas", value: bottles },
              {
                term: "Formato previsto",
                value: lot.plannedFormatCl != null ? `${fmtNumber(lot.plannedFormatCl)} cL` : "—",
              },
              {
                term: "Grado previsto",
                value: lot.targetAbvPercent != null ? `${fmtNumber(lot.targetAbvPercent, 1)} % vol` : "—",
              },
              { term: "Laboratorio", value: lab.label },
              { term: "Expediente", value: lot.dossierStatus === "CLOSED" ? "Cerrado" : "Abierto" },
              { term: "En esta etapa desde", value: fmtDate(lot.stageChangedAt) },
              { term: "Creado", value: `${fmtDateTime(lot.createdAt)} · ${actorText(lot.createdBy)}` },
              ...(lot.notes ? [{ term: "Notas", value: lot.notes }] : []),
            ]}
          />
          {canWrite && !isTerminalStage(lot.stage) && lot.links.bottlingBatchId === null && <DiscardLot lot={lot} />}
        </Card>

        {lot.denomination.status !== "NOT_APPLICABLE" && (
          <Card className="grid grid-cols-1 gap-4">
            <CardHeader title="Denominación de origen" />
            <DoEvaluationView evaluation={lot.denomination} terroirNames={terroirNames} />
          </Card>
        )}

        <Card className="grid grid-cols-1 gap-4" aria-label="Reglas del lote">
          <CardHeader
            title="Reglas del lote"
            description={
              lot.rules.origin === "MIGRATION"
                ? `Reglas fijadas al migrar el lote, el ${fmtDate(lot.rules.takenAt)}. No cambian aunque cambie la configuración.`
                : `Instantánea tomada al crear el lote, el ${fmtDate(lot.rules.takenAt)}. No cambia aunque cambie la configuración.`
            }
          />
          <RulesList items={rules} label="Instantánea de reglas del lote" />
        </Card>
      </div>
    </div>
  );
}
