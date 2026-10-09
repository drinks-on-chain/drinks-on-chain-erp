"use client";

import { useCallback, useState } from "react";
import { keepPreviousData, useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TerroirResponse } from "@drinks-on-chain/mocks";
import type { Page } from "@/lib/api/envelope";
import { ApiError } from "@/lib/api/errors";
import { createIdempotencyKeys, withIdempotency } from "@/lib/api/idempotency";
import { useMe } from "@/lib/auth/hooks";
import {
  CHAIN_POLL_MS,
  anchorInProgress,
  chainAccountInProgress,
  collectionInProgress,
  lotTokenizationInProgress,
} from "./chain";
import { erpKeys } from "./keys";
import { can } from "./permissions";
import {
  erpApi,
  type AuditQuery,
  type BottleCodeQuery,
  type HarvestQuery,
  type LotQuery,
  type ProductionQuery,
  type ProductionReportQuery,
  type TankQuery,
  type TerroirQuery,
  type TokenizationRequestQuery,
} from "./resources";

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

export const useLotBalance = (id: string, enabled = true) =>
  useQuery({ queryKey: erpKeys.lotBalance(id), queryFn: ({ signal }) => erpApi.lotBalance(id, signal), enabled });

/**
 * Vista previa del embotellado (`POST …/bottling/preview`): no escribe nada, así que se trata como
 * una lectura. Devuelve el balance y las reglas que el servidor daría por incumplidas; la vista
 * anterior sigue visible mientras llega la nueva.
 */
export const useBottlingPreview = (lotId: string, body: Parameters<typeof erpApi.bottlingPreview>[1] | null) =>
  useQuery({
    queryKey: erpKeys.bottlingPreview(lotId, body ?? {}),
    queryFn: ({ signal }) => erpApi.bottlingPreview(lotId, body!, signal),
    enabled: body !== null,
    placeholderData: keepPreviousData,
    retry: false,
  });

/** Códigos de botella del lote, paginados en el servidor (solo dirección y enología). */
export const useBottleCodes = (lotId: string, q: BottleCodeQuery, enabled = true) =>
  useQuery({
    queryKey: erpKeys.bottleCodes(lotId, q),
    queryFn: ({ signal }) => erpApi.bottleCodes(lotId, q, signal),
    enabled,
    placeholderData: keepPreviousData,
  });

/** Estado de una exportación ZIP: se consulta cada 2 s mientras el worker la genera. */
export const useBottleCodeExport = (lotId: string, exportId: string | null) =>
  useQuery({
    queryKey: erpKeys.bottleCodeExport(lotId, exportId ?? ""),
    queryFn: ({ signal }) => erpApi.bottleCodeExport(lotId, exportId!, signal),
    enabled: !!exportId,
    refetchInterval: (query) => (query.state.data?.status === "PENDING" || !query.state.data ? 2_000 : false),
  });

/** Análisis de laboratorio del lote (§8): todos, con `current` en el vigente. */
export const useLotLabAnalyses = (lotId: string, enabled = true) =>
  useQuery({
    queryKey: erpKeys.lotLabs(lotId),
    queryFn: ({ signal }) => erpApi.lotLabAnalyses(lotId, signal),
    enabled,
  });
/** Correcciones compensatorias del lote (§9). */
export const useCorrections = (lotId: string, enabled = true) =>
  useQuery({
    queryKey: erpKeys.lotCorrections(lotId),
    queryFn: ({ signal }) => erpApi.corrections(lotId, signal),
    enabled,
  });
/** Requisitos del expediente y la huella que tendría si se cerrara ahora (§10). */
export const useDossierPreview = (lotId: string, enabled = true) =>
  useQuery({
    queryKey: erpKeys.dossierPreview(lotId),
    queryFn: ({ signal }) => erpApi.dossierPreview(lotId, signal),
    enabled,
  });
/** Expediente del lote; mientras su anclaje esté en vuelo se vuelve a consultar cada 5 s (Ola 3 §2.4). */
export const useDossier = (lotId: string, enabled = true) =>
  useQuery({
    queryKey: erpKeys.dossier(lotId),
    queryFn: ({ signal }) => erpApi.dossier(lotId, signal),
    enabled,
    refetchInterval: (query) => (anchorInProgress(query.state.data?.anchor) ? CHAIN_POLL_MS : false),
  });
/** Archivos del lote (§11.5), con su URL firmada de 15 minutos: se renuevan pasados 10. */
export const useAttachments = (lotId: string, enabled = true) =>
  useQuery({
    queryKey: erpKeys.lotAttachments(lotId),
    queryFn: ({ signal }) => erpApi.attachments(lotId, signal),
    enabled,
    staleTime: 10 * 60_000,
    refetchInterval: 10 * 60_000,
  });
/** Panel de la bodega (§11.2): lo calcula el servidor. */
export const useTraceDashboard = (enabled = true) =>
  useQuery({ queryKey: erpKeys.traceDashboard(), queryFn: ({ signal }) => erpApi.traceDashboard(signal), enabled });
/** Reporte de producción (§11.4): una fila por lote y totales por tipo. */
export const useProductionReport = (q: ProductionReportQuery, enabled = true) =>
  useQuery({
    queryKey: erpKeys.productionReport(q),
    queryFn: ({ signal }) => erpApi.productionReport(q, signal),
    enabled,
    placeholderData: keepPreviousData,
  });

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

export const useBottlings = () =>
  useQuery({ queryKey: erpKeys.bottlings(), queryFn: ({ signal }) => erpApi.bottlings({}, signal) });
export const useBottling = (id: string) =>
  useQuery({ queryKey: erpKeys.bottling(id), queryFn: ({ signal }) => erpApi.bottling(id, signal) });

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

// Cadena y tokenización (contrato de la Ola 3). Las consultas con transacciones incrustadas se
// repiten cada 5 s mientras alguna siga en curso, y solo entonces (§2.4).

/** Cuenta de la bodega en la red (1F): identidad, NFT por lote, anclajes y últimas transacciones. */
export const useChainAccount = (enabled = true) =>
  useQuery({
    queryKey: erpKeys.chainAccount(),
    queryFn: ({ signal }) => erpApi.chainAccount(signal),
    enabled,
    refetchInterval: (query) => (query.state.data && chainAccountInProgress(query.state.data) ? CHAIN_POLL_MS : false),
  });
/**
 * Estado de tokenización del lote: límite, bloqueos, solicitud abierta, colección e historial. La
 * solicitud la decide otra persona (el back office): se vuelve a pedir cada vez que se abre.
 */
export const useLotTokenization = (lotId: string, enabled = true) =>
  useQuery({
    queryKey: erpKeys.lotTokenization(lotId),
    queryFn: ({ signal }) => erpApi.lotTokenization(lotId, signal),
    enabled,
    staleTime: 0,
    refetchInterval: (query) =>
      query.state.data && lotTokenizationInProgress(query.state.data) ? CHAIN_POLL_MS : false,
  });
/** Solicitudes de tokenización de la bodega, paginadas en el servidor. */
export const useTokenizationRequests = (q: TokenizationRequestQuery, enabled = true) =>
  useQuery({
    queryKey: erpKeys.tokenizationRequests(q),
    queryFn: ({ signal }) => erpApi.tokenizationRequests(q, signal),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 0,
  });
export const useTokenizationRequest = (id: string | null, enabled = true) =>
  useQuery({
    queryKey: erpKeys.tokenizationRequest(id ?? ""),
    queryFn: ({ signal }) => erpApi.tokenizationRequest(id!, signal),
    enabled: enabled && !!id,
    staleTime: 0,
  });
/** Colección del lote con sus emisiones (`ChainTxRef` incrustados). */
export const useCollection = (id: string | null, enabled = true) =>
  useQuery({
    queryKey: erpKeys.collection(id ?? ""),
    queryFn: ({ signal }) => erpApi.collection(id!, signal),
    enabled: enabled && !!id,
    refetchInterval: (query) => (query.state.data && collectionInProgress(query.state.data) ? CHAIN_POLL_MS : false),
  });
/**
 * Cierre del lote con faltante (solo lectura; dirección y contabilidad). Sin embotellar ni descartar
 * el servidor responde 409 `TOK_CLOSURE_NOT_APPLICABLE`: se pide solo cuando aplica y no se reintenta.
 */
export const useCollectionClosure = (id: string | null, enabled = true) =>
  useQuery({
    queryKey: erpKeys.collectionClosure(id ?? ""),
    queryFn: ({ signal }) => erpApi.collectionClosure(id!, signal),
    enabled: enabled && !!id,
    retry: false,
  });

/** Vuelve a pedir todo el ERP (p. ej. cuando una transacción en la red termina y cambia el lote). */
export function useRefreshErp() {
  const client = useQueryClient();
  return useCallback(() => client.invalidateQueries({ queryKey: erpKeys.all }), [client]);
}

/** Como useHarvestBatches, pero solo consulta si `enabled` (p. ej. cuando el detalle del terroir no trae sus lotes). */
export const useHarvestBatchesIf = (q: HarvestQuery, enabled: boolean) =>
  useQuery({ queryKey: erpKeys.harvestBatches(q), queryFn: ({ signal }) => erpApi.harvestBatches(q, signal), enabled });

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
export const useDiscardAging = () =>
  useErpMutation((v: { id: string; body: Parameters<typeof erpApi.discardAging>[1] }) =>
    erpApi.discardAging(v.id, v.body),
  );
export const useCreateDistillation = () => useErpMutation(erpApi.createDistillation);
/** Cierre de la destilación con sus cortes: empieza el reposo. */
export const useCloseDistillation = () =>
  useErpMutation((v: { id: string; body: Parameters<typeof erpApi.closeDistillation>[1] }) =>
    erpApi.closeDistillation(v.id, v.body),
  );
export const useDiscardProduction = () =>
  useErpMutation((v: { id: string; reason: string }) => erpApi.discardProduction(v.id, { reason: v.reason }));
/** Embotellado del lote (una sola vez), con `Idempotency-Key`. */
export const useCreateLotBottling = () =>
  useIdempotentErpMutation(
    (v: { lotId: string; body: Parameters<typeof erpApi.createLotBottling>[1] }) => v,
    (v, key) => erpApi.createLotBottling(v.lotId, v.body, key),
  );
/** CSV de los códigos de botella (queda en la bitácora con su rango). */
export const useBottleCodesCsv = () =>
  useErpMutation((v: { lotId: string; range?: Parameters<typeof erpApi.bottleCodesCsv>[1] }) =>
    erpApi.bottleCodesCsv(v.lotId, v.range),
  );
export const useCreateBottleCodeExport = () =>
  useErpMutation((v: { lotId: string; body: Parameters<typeof erpApi.createBottleCodeExport>[1] }) =>
    erpApi.createBottleCodeExport(v.lotId, v.body),
  );
export const useVoidBottleCode = () =>
  useErpMutation((v: { code: string; body: Parameters<typeof erpApi.voidBottleCode>[1] }) =>
    erpApi.voidBottleCode(v.code, v.body),
  );
/**
 * Lote recién leído del servidor (sin caché), para comparar su estado antes y después de una
 * escritura: p. ej. las incidencias que abre una corrección en un lote ya embotellado.
 */
export function useFreshLot() {
  const client = useQueryClient();
  return (lotId: string) =>
    client.fetchQuery({ queryKey: erpKeys.lot(lotId), queryFn: () => erpApi.lot(lotId), staleTime: 0 });
}
/** Análisis de laboratorio del lote: uno nuevo sustituye al vigente (reanálisis). */
export const useCreateLotLabAnalysis = () =>
  useErpMutation((v: { lotId: string; body: Parameters<typeof erpApi.createLotLabAnalysis>[1] }) =>
    erpApi.createLotLabAnalysis(v.lotId, v.body),
  );
/** Corrección compensatoria de un registro del lote: nada se edita ni se borra. */
export const useCreateCorrection = () =>
  useErpMutation((v: { lotId: string; body: Parameters<typeof erpApi.createCorrection>[1] }) =>
    erpApi.createCorrection(v.lotId, v.body),
  );
export const useCreateTerroirCorrection = () =>
  useErpMutation((v: { terroirId: string; body: Parameters<typeof erpApi.createTerroirCorrection>[1] }) =>
    erpApi.createTerroirCorrection(v.terroirId, v.body),
  );
/** Cierre del expediente del lote, con `Idempotency-Key`: fija su huella. */
export const useCloseDossier = () =>
  useIdempotentErpMutation(
    (lotId: string) => ({ lotId, confirm: true }),
    (lotId, key) => erpApi.closeDossier(lotId, key),
  );
/** Autorizar tokenización o ampliar la cuota de un lote (solo el dueño), con `Idempotency-Key`. */
export const useCreateTokenizationRequest = () =>
  useIdempotentErpMutation(
    (v: { lotId: string; body: Parameters<typeof erpApi.createTokenizationRequest>[1] }) => v,
    (v, key) => erpApi.createTokenizationRequest(v.lotId, v.body, key),
  );
/** Editar una solicitud con cambios pedidos (o enviada y aún sin tomar). */
export const useUpdateTokenizationRequest = () =>
  useErpMutation((v: { id: string; body: Parameters<typeof erpApi.updateTokenizationRequest>[1] }) =>
    erpApi.updateTokenizationRequest(v.id, v.body),
  );
/** Reenviar una solicitud con cambios pedidos, con `Idempotency-Key`. */
export const useResubmitTokenizationRequest = () =>
  useIdempotentErpMutation(
    (v: { id: string; message?: string }) => v,
    (v, key) => erpApi.resubmitTokenizationRequest(v.id, v.message ? { message: v.message } : {}, key),
  );
/** Retirar una solicitud abierta, con motivo. */
export const useWithdrawTokenizationRequest = () =>
  useErpMutation((v: { id: string; reason: string }) => erpApi.withdrawTokenizationRequest(v.id, v.reason));
/** JSON canónico del expediente: los bytes exactos que se hashean. */
export const useDossierCanonical = () => useMutation({ mutationFn: (lotId: string) => erpApi.dossierCanonical(lotId) });
export const useCreateAttachment = () =>
  useErpMutation((v: { lotId: string; body: Parameters<typeof erpApi.createAttachment>[1] }) =>
    erpApi.createAttachment(v.lotId, v.body),
  );
export const useChangeAttachmentVisibility = () =>
  useErpMutation(
    (v: { lotId: string; attachmentId: string; body: Parameters<typeof erpApi.changeAttachmentVisibility>[2] }) =>
      erpApi.changeAttachmentVisibility(v.lotId, v.attachmentId, v.body),
  );
/** CSV del reporte de producción con los mismos filtros de la tabla. */
export const useProductionReportCsv = () =>
  useMutation({ mutationFn: (q: ProductionReportQuery) => erpApi.productionReportCsv(q) });
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
