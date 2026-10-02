"use client";

import { useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { deriveLotViews, type LotChain, type LotView, type TerroirResponse } from "@drinks-on-chain/mocks";
import type { Page } from "@/lib/api/envelope";
import { ApiError } from "@/lib/api/errors";
import { createIdempotencyKeys, withIdempotency } from "@/lib/api/idempotency";
import { useMe } from "@/lib/auth/hooks";
import { erpKeys } from "./keys";
import { can } from "./permissions";
import {
  erpApi,
  type AuditQuery,
  type HarvestQuery,
  type LotQuery,
  type ProductionQuery,
  type TankQuery,
  type TerroirQuery,
} from "./resources";
import { today } from "./today";

// Hooks de datos del ERP. Las pantallas solo importan de aquí.

// ---------- Lecturas ----------

// Lote del servidor (contrato de la Ola 2 §2). La lista se filtra y pagina en el servidor: la
// página anterior sigue visible mientras llega la siguiente.
export const useLots = (q: LotQuery = {}, enabled = true) =>
  useQuery({
    queryKey: erpKeys.lots(q),
    queryFn: ({ signal }) => erpApi.lots(q, signal),
    enabled,
    placeholderData: keepPreviousData,
  });
export const useLot = (id: string, enabled = true) =>
  useQuery({ queryKey: erpKeys.lot(id), queryFn: ({ signal }) => erpApi.lot(id, signal), enabled });
export const useLotTimeline = (id: string, enabled = true) =>
  useQuery({ queryKey: erpKeys.lotTimeline(id), queryFn: ({ signal }) => erpApi.lotTimeline(id, signal), enabled });
export const useLotGraph = (id: string, enabled = true) =>
  useQuery({ queryKey: erpKeys.lotGraph(id), queryFn: ({ signal }) => erpApi.lotGraph(id, signal), enabled });

/**
 * Enlaces antiguos `/lotes/{harvestBatchId}` (contrato §16.3): el id era el del pesaje. Devuelve
 * el `lotId` de ese pesaje, o `null` si no existe o es uva sin lote.
 */
export const useLegacyLotId = (harvestBatchId: string, enabled: boolean) =>
  useQuery({
    queryKey: [...erpKeys.harvestBatch(harvestBatchId), "lot-id"] as const,
    queryFn: ({ signal }) =>
      erpApi.harvestBatch(harvestBatchId, signal).then(
        (h) => h.lotId,
        (e: unknown) => {
          if (e instanceof ApiError && (e.isNotFound || e.isValidation)) return null;
          throw e;
        },
      ),
    enabled,
  });

const NO_TERROIRS: Page<TerroirResponse> = { items: [], total: 0, limit: 0, offset: 0 };

/**
 * Parcelas de la bodega. Vendimia y vinificación las usan para poner nombre a la parcela: un rol
 * sin lectura de parcelas no las pide y recibe la lista vacía (con otra clave, para no mezclarla
 * con la de quien sí las lee). Hoy todos los roles de bodega las leen (Ola 1 §11 bis).
 */
export function useTerroirs(q: TerroirQuery = {}) {
  const me = useMe();
  const allowed = can(me.data, "terroir.read");
  return useQuery({
    queryKey: allowed ? erpKeys.terroirs(q) : [...erpKeys.terroirs(q), "sin-permiso"],
    queryFn: ({ signal }) => (allowed ? erpApi.terroirs(q, signal) : Promise.resolve(NO_TERROIRS)),
    enabled: !!me.data,
  });
}
export const useTerroir = (id: string) =>
  useQuery({ queryKey: erpKeys.terroir(id), queryFn: ({ signal }) => erpApi.terroir(id, signal) });

export const useHarvestBatches = (q: HarvestQuery = {}) =>
  useQuery({ queryKey: erpKeys.harvestBatches(q), queryFn: ({ signal }) => erpApi.harvestBatches(q, signal) });
export const useHarvestBatch = (id: string) =>
  useQuery({ queryKey: erpKeys.harvestBatch(id), queryFn: ({ signal }) => erpApi.harvestBatch(id, signal) });

export const useTanks = (q: TankQuery = {}) =>
  useQuery({ queryKey: erpKeys.tanks(q), queryFn: ({ signal }) => erpApi.tanks(q, signal) });
export const useTank = (id: string) =>
  useQuery({ queryKey: erpKeys.tank(id), queryFn: ({ signal }) => erpApi.tank(id, signal) });

type TankDetailResult = ReturnType<typeof useTank>;
const combineTankDetails = (rs: TankDetailResult[]) => ({
  data: rs.flatMap((r) => (r.data ? [r.data] : [])),
  isPending: rs.some((r) => r.isPending),
  isError: rs.some((r) => r.isError),
  error: rs.find((r) => r.error)?.error ?? null,
  refetch: () => Promise.all(rs.map((r) => r.refetch())),
});
/** Detalle (con lecturas y tratamientos) de varios tanques: temperatura en el mapa de tanques. */
export const useTankDetails = (ids: readonly string[]) =>
  useQueries({
    queries: ids.map((id) => ({
      queryKey: erpKeys.tank(id),
      queryFn: ({ signal }: { signal: AbortSignal }) => erpApi.tank(id, signal),
    })),
    combine: combineTankDetails,
  });

export const useAgings = (enabled = true) =>
  useQuery({ queryKey: erpKeys.agings(), queryFn: ({ signal }) => erpApi.agings({}, signal), enabled });
export const useAging = (id: string) =>
  useQuery({ queryKey: erpKeys.aging(id), queryFn: ({ signal }) => erpApi.aging(id, signal) });

export const useProductions = (q: ProductionQuery = {}, enabled = true) =>
  useQuery({ queryKey: erpKeys.productions(q), queryFn: ({ signal }) => erpApi.productions(q, signal), enabled });
export const useProduction = (id: string) =>
  useQuery({ queryKey: erpKeys.production(id), queryFn: ({ signal }) => erpApi.production(id, signal) });
export const useRestStatus = (id: string) =>
  useQuery({ queryKey: erpKeys.restStatus(id), queryFn: ({ signal }) => erpApi.restStatus(id, signal) });

export const useBottlings = () =>
  useQuery({ queryKey: erpKeys.bottlings(), queryFn: ({ signal }) => erpApi.bottlings({}, signal) });
export const useBottling = (id: string) =>
  useQuery({ queryKey: erpKeys.bottling(id), queryFn: ({ signal }) => erpApi.bottling(id, signal) });
export const useLabAnalysis = (bottlingId: string) =>
  useQuery({ queryKey: erpKeys.lab(bottlingId), queryFn: ({ signal }) => erpApi.labAnalysis(bottlingId, signal) });
export const useTraceabilityDag = (bottlingId: string) =>
  useQuery({ queryKey: erpKeys.dag(bottlingId), queryFn: ({ signal }) => erpApi.dag(bottlingId, signal) });

export const useWinery = (enabled = true) =>
  useQuery({ queryKey: erpKeys.winery(), queryFn: ({ signal }) => erpApi.winery(signal), enabled });
export const useMembers = (enabled = true) =>
  useQuery({ queryKey: erpKeys.members(), queryFn: ({ signal }) => erpApi.members(signal), enabled });
/** Invitaciones de la bodega activa (solo el dueño). */
export const useInvitations = (enabled = true) =>
  useQuery({ queryKey: erpKeys.invitations(), queryFn: ({ signal }) => erpApi.invitations(signal), enabled });
/** Valor efectivo de los parámetros para la bodega activa (lectura). */
export const useEffectiveSettings = (enabled = true) =>
  useQuery({ queryKey: erpKeys.settings(), queryFn: ({ signal }) => erpApi.settings(signal), enabled });
/** Bitácora propia (dueño), paginada en el servidor; la página anterior sigue visible mientras carga. */
export const useAudit = (q: AuditQuery, enabled = true) =>
  useQuery({
    queryKey: erpKeys.audit(q),
    queryFn: ({ signal }) => erpApi.audit(q, signal),
    enabled,
    placeholderData: keepPreviousData,
  });

/**
 * Vista derivada "Lote" (09 §2): une toda la cadena de la bodega y calcula etapa y candado
 * de cada lote de vendimia. Carga las seis colecciones completas.
 */
const NONE: never[] = [];

export function useLotViews() {
  // Cada rol lee solo parte de la cadena (matriz del backend): lo que no puede leer no se pide y
  // cuenta como vacío, así el panel del operario o de agronomía no falla con un 403.
  const me = useMe();
  const allowed = [
    can(me.data, "harvest.read"),
    can(me.data, "terroir.read"),
    can(me.data, "tank.read"),
    can(me.data, "aging.read"),
    can(me.data, "distillation.read"),
    can(me.data, "bottling.read"),
  ];
  const results = useQueries({
    queries: [
      {
        queryKey: erpKeys.harvestBatches(),
        queryFn: ({ signal }) => erpApi.harvestBatches({}, signal),
        enabled: allowed[0],
      },
      { queryKey: erpKeys.terroirs(), queryFn: ({ signal }) => erpApi.terroirs({}, signal), enabled: allowed[1] },
      { queryKey: erpKeys.tanks(), queryFn: ({ signal }) => erpApi.tanks({}, signal), enabled: allowed[2] },
      { queryKey: erpKeys.agings(), queryFn: ({ signal }) => erpApi.agings({}, signal), enabled: allowed[3] },
      { queryKey: erpKeys.productions(), queryFn: ({ signal }) => erpApi.productions({}, signal), enabled: allowed[4] },
      { queryKey: erpKeys.bottlings(), queryFn: ({ signal }) => erpApi.bottlings({}, signal), enabled: allowed[5] },
    ],
  });
  const used = results.filter((_, i) => allowed[i]);
  // Lo que el rol no lee cuenta como vacío (una misma lista para no recalcular); lo que lee, cuando llega.
  const items = <T>(i: number, page: { items: T[] } | undefined): T[] | undefined =>
    me.data ? (allowed[i] ? page?.items : (NONE as T[])) : undefined;
  const harvestBatches = items(0, results[0].data);
  const terroirs = items(1, results[1].data);
  const tanks = items(2, results[2].data);
  const wineAgings = items(3, results[3].data);
  const productionBatches = items(4, results[4].data);
  const bottlings = items(5, results[5].data);

  const chain = useMemo<LotChain | undefined>(
    () =>
      harvestBatches && terroirs && tanks && wineAgings && productionBatches && bottlings
        ? { harvestBatches, terroirs, tanks, wineAgings, productionBatches, bottlings }
        : undefined,
    [harvestBatches, terroirs, tanks, wineAgings, productionBatches, bottlings],
  );

  const data = useMemo<LotView[] | undefined>(
    () => (chain ? deriveLotViews(chain, { today: today() }) : undefined),
    [chain],
  );

  return {
    data,
    chain,
    isPending: !me.data || used.some((r) => r.isPending),
    isError: used.some((r) => r.isError),
    error: used.find((r) => r.error)?.error ?? null,
    isFetching: used.some((r) => r.isFetching),
    refetch: () => Promise.all(used.map((r) => r.refetch())),
  };
}

/** Como useHarvestBatches, pero solo consulta si `enabled` (p. ej. cuando el detalle del terroir no trae sus lotes). */
export const useHarvestBatchesIf = (q: HarvestQuery, enabled: boolean) =>
  useQuery({ queryKey: erpKeys.harvestBatches(q), queryFn: ({ signal }) => erpApi.harvestBatches(q, signal), enabled });

/**
 * Certificado de laboratorio de varios embotellados (no hay endpoint de lista). `null` si el
 * embotellado aún no tiene certificado (el backend responde 404).
 */
export function useLabAnalysesOf(bottlingIds: string[]) {
  const results = useQueries({
    queries: bottlingIds.map((id) => ({
      queryKey: [...erpKeys.lab(id), "optional"] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        erpApi.labAnalysis(id, signal).catch((e: unknown) => {
          if (e instanceof ApiError && e.isNotFound) return null;
          throw e;
        }),
    })),
  });
  return new Map(bottlingIds.map((id, i) => [id, results[i]]));
}

// ---------- Escrituras ----------

/** Mutación que invalida todo el ERP al terminar (la cadena está enlazada). */
function useErpMutation<TVars, TData>(fn: (vars: TVars) => Promise<TData>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => client.invalidateQueries({ queryKey: erpKeys.all }),
  });
}

export const useCreateTerroir = () => useErpMutation(erpApi.createTerroir);
export const useUpdateTerroir = () =>
  useErpMutation((v: { id: string; body: Parameters<typeof erpApi.updateTerroir>[1] }) =>
    erpApi.updateTerroir(v.id, v.body),
  );
/**
 * Escritura con `Idempotency-Key` (pesajes, lecturas, embotellado y cierre del expediente,
 * contrato de la Ola 2 §0): un reintento del mismo envío sin respuesta repite la clave.
 */
function useIdempotentErpMutation<TVars, TData>(
  body: (vars: TVars) => unknown,
  send: (vars: TVars, key: string) => Promise<TData>,
) {
  const [keys] = useState(() => createIdempotencyKeys());
  return useErpMutation(withIdempotency(keys, body, send));
}

export const useCreateLot = () =>
  useIdempotentErpMutation(
    (body: Parameters<typeof erpApi.createLot>[0]) => body,
    (body, key) => erpApi.createLot(body, key),
  );
export const useUpdateLot = () =>
  useErpMutation((v: { id: string; body: Parameters<typeof erpApi.updateLot>[1] }) => erpApi.updateLot(v.id, v.body));
export const useDiscardLot = () =>
  useErpMutation((v: { id: string; reason: string }) => erpApi.discardLot(v.id, { reason: v.reason }));

export const useCreateHarvestBatch = () =>
  useIdempotentErpMutation(
    (body: Parameters<typeof erpApi.createHarvestBatch>[0]) => body,
    (body, key) => erpApi.createHarvestBatch(body, key),
  );
/** Análisis de madurez de un pesaje (solo inserción; el último es el vigente). */
export const useCreateMaturityAnalysis = () =>
  useErpMutation((v: { harvestBatchId: string; body: Parameters<typeof erpApi.createMaturityAnalysis>[1] }) =>
    erpApi.createMaturityAnalysis(v.harvestBatchId, v.body),
  );
/** Dictamen fitosanitario de un pesaje (solo inserción, con su autor). */
export const useCreatePhytoDecision = () =>
  useErpMutation((v: { harvestBatchId: string; body: Parameters<typeof erpApi.createPhytoDecision>[1] }) =>
    erpApi.createPhytoDecision(v.harvestBatchId, v.body),
  );
export const useCreateTank = () => useErpMutation(erpApi.createTank);
/** Transiciones del tanque por acciones: iniciar, completar (con la bifurcación) y limpiar. */
export const useStartTank = () =>
  useErpMutation((v: { id: string; body?: Parameters<typeof erpApi.startTank>[1] }) => erpApi.startTank(v.id, v.body));
export const useCompleteTank = () =>
  useErpMutation((v: { id: string; body: Parameters<typeof erpApi.completeTank>[1] }) =>
    erpApi.completeTank(v.id, v.body),
  );
export const useCleanTank = () =>
  useErpMutation((v: { id: string; body?: Parameters<typeof erpApi.cleanTank>[1] }) => erpApi.cleanTank(v.id, v.body));
export const useAddTankLog = () =>
  useIdempotentErpMutation(
    (v: { id: string; body: Parameters<typeof erpApi.addTankLog>[1] }) => v,
    (v, key) => erpApi.addTankLog(v.id, v.body, key),
  );
export const useAddTreatment = () =>
  useErpMutation((v: { id: string; body: Parameters<typeof erpApi.addTreatment>[1] }) =>
    erpApi.addTreatment(v.id, v.body),
  );
export const useCreateAging = () => useErpMutation(erpApi.createAging);
export const useCreateDistillation = () => useErpMutation(erpApi.createDistillation);
export const useCreateBottling = () => useErpMutation(erpApi.createBottling);
export const useCreateLabAnalysis = () => useErpMutation(erpApi.createLabAnalysis);
export const useUpdateWinery = () => useErpMutation(erpApi.updateWinery);

// Equipo: cada cambio deja una entrada en la bitácora, que también se invalida (cuelga de "erp").
export const useUpdateMemberRole = () =>
  useErpMutation((v: { membershipId: string; body: Parameters<typeof erpApi.updateMemberRole>[1] }) =>
    erpApi.updateMemberRole(v.membershipId, v.body),
  );
export const useBlockMember = () =>
  useErpMutation((v: { membershipId: string; reason: string | null }) => erpApi.blockMember(v.membershipId, v.reason));
export const useUnblockMember = () => useErpMutation((membershipId: string) => erpApi.unblockMember(membershipId));
export const useCreateInvitation = () => useErpMutation(erpApi.createInvitation);
export const useResendInvitation = () => useErpMutation((id: string) => erpApi.resendInvitation(id));
export const useRevokeInvitation = () => useErpMutation((id: string) => erpApi.revokeInvitation(id));
export const useUpload = () =>
  useMutation({ mutationFn: (v: Parameters<typeof erpApi.upload>) => erpApi.upload(...v) });

/**
 * URL firmada de un archivo guardado (`GET /v1/uploads/url?key=`). Solo para claves del
 * almacenamiento (`isStorageKey`); caduca a los 15 min, así que se renueva pasados 10.
 */
export const useStoredFileUrl = (key: string | null) =>
  useQuery({
    queryKey: erpKeys.fileUrl(key ?? ""),
    queryFn: ({ signal }) => erpApi.fileUrl(key!, signal),
    enabled: !!key,
    staleTime: 10 * 60_000,
    refetchInterval: 10 * 60_000,
    retry: false,
  });
