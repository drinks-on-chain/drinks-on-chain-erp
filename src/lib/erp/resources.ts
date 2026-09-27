import { z } from "zod";
import {
  BatchLabAnalysisResponseSchema,
  BottlingBatchResponseSchema,
  EnologicalTreatmentSchema,
  FermentationLogSchema,
  FermentationTankDetailSchema,
  FermentationTankResponseSchema,
  HarvestBatchDetailSchema,
  HarvestBatchResponseSchema,
  ProductionBatchResponseSchema,
  RestStatusResponseSchema,
  TerroirDetailSchema,
  TerroirResponseSchema,
  WineAgingResponseSchema,
  AuditEventSchema,
  EffectiveSettingSchema,
  InvitationSchema,
  MemberSchema,
  WineryResponseSchema,
  type CreateBatchLabAnalysisDto,
  type CreateBottlingBatchDto,
  type CreateDistillationBatchDto,
  type CreateEnologicalTreatmentDto,
  type CreateFermentationLogDto,
  type CreateFermentationTankDto,
  type CreateHarvestBatchDto,
  type CreateInvitationDto,
  type CreateTerroirDto,
  type CreateWineAgingBatchDto,
  type UpdatePhytoStatusDto,
  type UpdateTerroirDto,
  type UpdateMemberRoleDto,
  type UpdateWineryDto,
} from "@drinks-on-chain/mocks";
import { api } from "@/lib/api/client";
import { pageSchema, type Page } from "@/lib/api/envelope";
import { fetchAllPages, MAX_PAGE_SIZE } from "@/lib/api/pagination";
import { DagResponseSchema } from "./dag";
import { omitNulls } from "./omit-nulls";

// Acceso a los endpoints del ERP (09 §3). Una función por operación; las pantallas usan
// los hooks de hooks.ts, nunca estas funciones directamente.

type Query = Record<string, string | number | boolean | null | undefined>;

async function page<T>(path: string, item: z.ZodType<T>, query: Query, signal?: AbortSignal): Promise<Page<T>> {
  const params = { limit: Number(query.limit), offset: Number(query.offset) };
  return api(path, { query, signal, schema: pageSchema(item, params) });
}

/**
 * Colección del backend. Sin `limit`, se carga entera en páginas de 100 (máximo del contrato
 * de la Ola 0 §2): las pantallas del ERP filtran en el cliente y la vista "Lote" necesita la
 * cadena completa. Con `limit`, una sola página (acotada a 100).
 */
async function list<T>(path: string, item: z.ZodType<T>, query: Query = {}, signal?: AbortSignal): Promise<Page<T>> {
  const { limit, offset, ...filters } = query;
  if (limit != null) {
    const size = Math.min(Number(limit), MAX_PAGE_SIZE);
    return page(path, item, { ...filters, limit: size, offset: Number(offset ?? 0) }, signal);
  }
  return fetchAllPages((p) => page(path, item, { ...filters, ...p }, signal));
}

export type PageQuery = { limit?: number; offset?: number };
export type TerroirQuery = PageQuery & { varietyName?: string; isDoEligible?: boolean };
export type HarvestQuery = PageQuery & { terroirId?: string; phytosanitaryStatus?: string; harvestYear?: number };
export type TankQuery = PageQuery & { status?: string; destinationType?: string; harvestBatchId?: string };
export type ProductionQuery = PageQuery & { restStatus?: string };
/** Filtros de la bitácora propia (contrato de la Ola 1 §7): fechas `AAAA-MM-DD` y código de acción. */
export type AuditQuery = { from?: string; to?: string; action?: string; limit: number; offset: number };
export type UploadFolder = "certificates" | "inspections" | "labels" | "lab-reports";

export type UploadResult = { url: string; key: string; originalName: string; mimeType: string; sizeBytes: number };

export const erpApi = {
  // Origen
  terroirs: (q: TerroirQuery = {}, s?: AbortSignal) => list("/v1/terroirs", TerroirResponseSchema, q, s),
  terroir: (id: string, signal?: AbortSignal) => api(`/v1/terroirs/${id}`, { schema: TerroirDetailSchema, signal }),
  createTerroir: (body: CreateTerroirDto) =>
    api("/v1/terroirs", { method: "POST", body: omitNulls(body), schema: TerroirResponseSchema }),
  updateTerroir: (id: string, body: UpdateTerroirDto) =>
    api(`/v1/terroirs/${id}`, { method: "PATCH", body, schema: TerroirResponseSchema }),

  // Vendimia
  harvestBatches: (q: HarvestQuery = {}, s?: AbortSignal) =>
    list("/v1/harvest-batches", HarvestBatchResponseSchema, q, s),
  harvestBatch: (id: string, signal?: AbortSignal) =>
    api(`/v1/harvest-batches/${id}`, { schema: HarvestBatchDetailSchema, signal }),
  createHarvestBatch: (body: CreateHarvestBatchDto) =>
    api("/v1/harvest-batches", { method: "POST", body: omitNulls(body), schema: HarvestBatchResponseSchema }),
  updatePhytoStatus: (id: string, body: UpdatePhytoStatusDto) =>
    api(`/v1/harvest-batches/${id}/phyto-status`, { method: "PATCH", body, schema: HarvestBatchResponseSchema }),

  // Vinificación
  tanks: (q: TankQuery = {}, s?: AbortSignal) => list("/v1/fermentation-tanks", FermentationTankResponseSchema, q, s),
  tank: (id: string, signal?: AbortSignal) =>
    api(`/v1/fermentation-tanks/${id}`, { schema: FermentationTankDetailSchema, signal }),
  createTank: (body: CreateFermentationTankDto) =>
    api("/v1/fermentation-tanks", { method: "POST", body: omitNulls(body), schema: FermentationTankResponseSchema }),
  addTankLog: (id: string, body: CreateFermentationLogDto) =>
    api(`/v1/fermentation-tanks/${id}/logs`, { method: "POST", body: omitNulls(body), schema: FermentationLogSchema }),
  addTreatment: (id: string, body: CreateEnologicalTreatmentDto) =>
    api(`/v1/fermentation-tanks/${id}/treatments`, {
      method: "POST",
      body: omitNulls(body),
      schema: EnologicalTreatmentSchema,
    }),

  // Crianza
  agings: (q: PageQuery = {}, s?: AbortSignal) => list("/v1/wine-aging", WineAgingResponseSchema, q, s),
  aging: (id: string, signal?: AbortSignal) => api(`/v1/wine-aging/${id}`, { schema: WineAgingResponseSchema, signal }),
  createAging: (body: CreateWineAgingBatchDto) =>
    api("/v1/wine-aging", { method: "POST", body: omitNulls(body), schema: WineAgingResponseSchema }),

  // Destilación
  productions: (q: ProductionQuery = {}, s?: AbortSignal) =>
    list("/v1/production-batches", ProductionBatchResponseSchema, q, s),
  production: (id: string, signal?: AbortSignal) =>
    api(`/v1/production-batches/${id}`, { schema: ProductionBatchResponseSchema, signal }),
  restStatus: (id: string, signal?: AbortSignal) =>
    api(`/v1/production-batches/${id}/rest-status`, { schema: RestStatusResponseSchema, signal }),
  createDistillation: (body: CreateDistillationBatchDto) =>
    api("/v1/production-batches/distillation", {
      method: "POST",
      body: omitNulls(body),
      schema: ProductionBatchResponseSchema,
    }),

  // Envasado, laboratorio y trazabilidad
  bottlings: (q: PageQuery = {}, s?: AbortSignal) => list("/v1/bottling", BottlingBatchResponseSchema, q, s),
  bottling: (id: string, signal?: AbortSignal) =>
    api(`/v1/bottling/${id}`, { schema: BottlingBatchResponseSchema, signal }),
  createBottling: (body: CreateBottlingBatchDto) =>
    api("/v1/bottling", { method: "POST", body: omitNulls(body), schema: BottlingBatchResponseSchema }),
  labAnalysis: (bottlingId: string, signal?: AbortSignal) =>
    api(`/v1/lab-analyses/batch/${bottlingId}`, { schema: BatchLabAnalysisResponseSchema, signal }),
  createLabAnalysis: (body: CreateBatchLabAnalysisDto) =>
    api("/v1/lab-analyses", { method: "POST", body: omitNulls(body), schema: BatchLabAnalysisResponseSchema }),
  dag: (bottlingId: string, signal?: AbortSignal) =>
    api(`/v1/traceability/dag/${bottlingId}`, { schema: DagResponseSchema, signal }),

  // Bodega
  winery: (signal?: AbortSignal) => api("/v1/wineries/my", { schema: WineryResponseSchema, signal }),
  updateWinery: (body: UpdateWineryDto) =>
    api("/v1/wineries/my", { method: "PATCH", body, schema: WineryResponseSchema }),

  // Equipo de la organización activa (contrato de la Ola 1 §2 y §5)
  members: (signal?: AbortSignal) =>
    list("/v1/organizations/current/members", MemberSchema, {}, signal).then((p) => p.items),
  updateMemberRole: (membershipId: string, body: UpdateMemberRoleDto) =>
    api(`/v1/organizations/current/members/${membershipId}`, { method: "PATCH", body, schema: MemberSchema }),
  blockMember: (membershipId: string, reason: string | null) =>
    api(`/v1/organizations/current/members/${membershipId}/block`, {
      method: "POST",
      body: { reason },
      schema: MemberSchema,
    }),
  unblockMember: (membershipId: string) =>
    api(`/v1/organizations/current/members/${membershipId}/unblock`, {
      method: "POST",
      body: {},
      schema: MemberSchema,
    }),
  invitations: (signal?: AbortSignal) =>
    list("/v1/organizations/current/invitations", InvitationSchema, {}, signal).then((p) => p.items),
  createInvitation: (body: CreateInvitationDto) =>
    api("/v1/organizations/current/invitations", { method: "POST", body, schema: InvitationSchema }),
  resendInvitation: (id: string) =>
    api(`/v1/invitations/${id}/resend`, { method: "POST", body: {}, schema: InvitationSchema }),
  revokeInvitation: (id: string) =>
    api(`/v1/invitations/${id}/revoke`, { method: "POST", body: {}, schema: InvitationSchema }),

  // Configuración efectiva (solo lectura) y bitácora propia (dueño)
  settings: (signal?: AbortSignal) =>
    api("/v1/organizations/current/settings", { schema: z.array(EffectiveSettingSchema), signal }),
  audit: (q: AuditQuery, signal?: AbortSignal) => page("/v1/organizations/current/audit", AuditEventSchema, q, signal),

  // Archivos: devuelve la URL que luego se pasa en los DTO
  upload: (file: File, folder: UploadFolder) => {
    const form = new FormData();
    form.append("file", file);
    return api<UploadResult>("/v1/uploads", { method: "POST", body: form, query: { folder } });
  },
};
