"use client";

import { useMemo } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { deriveLotViews, type LotChain, type LotView } from "@drinks-on-chain/mocks";
import { ApiError } from "@/lib/api/errors";
import { erpKeys } from "./keys";
import { erpApi, type HarvestQuery, type ProductionQuery, type TankQuery, type TerroirQuery } from "./resources";
import { today } from "./today";

// Hooks de datos del ERP. Las pantallas solo importan de aquí.

// ---------- Lecturas ----------

export const useTerroirs = (q: TerroirQuery = {}) =>
  useQuery({ queryKey: erpKeys.terroirs(q), queryFn: ({ signal }) => erpApi.terroirs(q, signal) });
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

export const useAgings = () =>
  useQuery({ queryKey: erpKeys.agings(), queryFn: ({ signal }) => erpApi.agings({}, signal) });
export const useAging = (id: string) =>
  useQuery({ queryKey: erpKeys.aging(id), queryFn: ({ signal }) => erpApi.aging(id, signal) });

export const useProductions = (q: ProductionQuery = {}) =>
  useQuery({ queryKey: erpKeys.productions(q), queryFn: ({ signal }) => erpApi.productions(q, signal) });
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
export const useMembers = () =>
  useQuery({ queryKey: erpKeys.members(), queryFn: ({ signal }) => erpApi.members(signal) });

/**
 * Vista derivada "Lote" (09 §2): une toda la cadena de la bodega y calcula etapa y candado
 * de cada lote de vendimia. Carga las seis colecciones completas.
 */
export function useLotViews() {
  const results = useQueries({
    queries: [
      { queryKey: erpKeys.harvestBatches(), queryFn: ({ signal }) => erpApi.harvestBatches({}, signal) },
      { queryKey: erpKeys.terroirs(), queryFn: ({ signal }) => erpApi.terroirs({}, signal) },
      { queryKey: erpKeys.tanks(), queryFn: ({ signal }) => erpApi.tanks({}, signal) },
      { queryKey: erpKeys.agings(), queryFn: ({ signal }) => erpApi.agings({}, signal) },
      { queryKey: erpKeys.productions(), queryFn: ({ signal }) => erpApi.productions({}, signal) },
      { queryKey: erpKeys.bottlings(), queryFn: ({ signal }) => erpApi.bottlings({}, signal) },
    ],
  });
  const [harvest, terroirs, tanks, agings, productions, bottlings] = results;
  const ready = results.every((r) => r.isSuccess);

  const chain = useMemo<LotChain | undefined>(() => {
    if (!ready) return undefined;
    return {
      harvestBatches: harvest.data!.items,
      terroirs: terroirs.data!.items,
      tanks: tanks.data!.items,
      wineAgings: agings.data!.items,
      productionBatches: productions.data!.items,
      bottlings: bottlings.data!.items,
    };
  }, [ready, harvest.data, terroirs.data, tanks.data, agings.data, productions.data, bottlings.data]);

  const data = useMemo<LotView[] | undefined>(
    () => (chain ? deriveLotViews(chain, { today: today() }) : undefined),
    [chain],
  );

  return {
    data,
    chain,
    isPending: results.some((r) => r.isPending),
    isError: results.some((r) => r.isError),
    error: results.find((r) => r.error)?.error ?? null,
    isFetching: results.some((r) => r.isFetching),
    refetch: () => Promise.all(results.map((r) => r.refetch())),
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
export const useCreateHarvestBatch = () => useErpMutation(erpApi.createHarvestBatch);
export const useUpdatePhytoStatus = () =>
  useErpMutation((v: { id: string; body: Parameters<typeof erpApi.updatePhytoStatus>[1] }) =>
    erpApi.updatePhytoStatus(v.id, v.body),
  );
export const useCreateTank = () => useErpMutation(erpApi.createTank);
export const useAddTankLog = () =>
  useErpMutation((v: { id: string; body: Parameters<typeof erpApi.addTankLog>[1] }) => erpApi.addTankLog(v.id, v.body));
export const useAddTreatment = () =>
  useErpMutation((v: { id: string; body: Parameters<typeof erpApi.addTreatment>[1] }) =>
    erpApi.addTreatment(v.id, v.body),
  );
export const useCreateAging = () => useErpMutation(erpApi.createAging);
export const useCreateDistillation = () => useErpMutation(erpApi.createDistillation);
export const useCreateBottling = () => useErpMutation(erpApi.createBottling);
export const useCreateLabAnalysis = () => useErpMutation(erpApi.createLabAnalysis);
export const useUpdateWinery = () => useErpMutation(erpApi.updateWinery);
export const useCreateMember = () => useErpMutation(erpApi.createMember);
export const useUpload = () =>
  useMutation({ mutationFn: (v: Parameters<typeof erpApi.upload>) => erpApi.upload(...v) });
