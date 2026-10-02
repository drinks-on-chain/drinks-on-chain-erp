import { z } from "zod";
import {
  BatchLabAnalysisResponseSchema,
  BottleCodeExportAcceptedSchema,
  BottleCodeExportSchema,
  BottleUnitSchema,
  BottlingBatchResponseSchema,
  BottlingPreviewSchema,
  CorrectionSchema,
  DossierPreviewSchema,
  EnologicalTreatmentSchema,
  FermentationLogSchema,
  FermentationTankDetailSchema,
  FermentationTankResponseSchema,
  HarvestBatchDetailSchema,
  HarvestBatchResponseSchema,
  LotAttachmentSchema,
  LotBalanceSchema,
  LotDossierSchema,
  LotGraphSchema,
  LotSchema,
  LotSummarySchema,
  LotTimelineSchema,
  MaturityAnalysisSchema,
  PhytoDecisionSchema,
  ProductionBatchResponseSchema,
  ProductionReportSchema,
  TerroirDetailSchema,
  TerroirResponseSchema,
  WineAgingResponseSchema,
  AuditEventSchema,
  EffectiveSettingSchema,
  InvitationSchema,
  MemberSchema,
  WineryResponseSchema,
  SignedUrlResponseSchema,
  UploadResponseSchema,
  type BottleUnitStatus,
  type ChangeLotAttachmentVisibilityDto,
  type CleanFermentationTankDto,
  type CloseDistillationDto,
  type CompleteFermentationTankDto,
  type CreateBottleCodeExportDto,
  type CreateLotAttachmentDto,
  type CreateLotBottlingDto,
  type CreateLotCorrectionDto,
  type CreateLotDto,
  type CreateLotLabAnalysisDto,
  type CreateMaturityAnalysisDto,
  type CreatePhytoDecisionDto,
  type CreateTerroirCorrectionDto,
  type DiscardLotDto,
  type DiscardProductionBatchDto,
  type DiscardWineAgingDto,
  type LotProductType,
  type LotStageCode,
  type StartFermentationTankDto,
  type UpdateLotDto,
  type VoidBottleCodeDto,
  type CreateDistillationBatchDto,
  type CreateEnologicalTreatmentDto,
  type CreateFermentationLogDto,
  type CreateFermentationTankDto,
  type CreateHarvestBatchDto,
  type CreateInvitationDto,
  type CreateTerroirDto,
  type CreateWineAgingBatchDto,
  type UpdateTerroirDto,
  type UpdateMemberRoleDto,
  type UpdateWineryDto,
} from "@drinks-on-chain/mocks";
import { api, apiFile } from "@/lib/api/client";
import { pageSchema, type Page } from "@/lib/api/envelope";
import { fetchAllPages, MAX_PAGE_SIZE } from "@/lib/api/pagination";
import { omitNulls, type Nullable } from "./omit-nulls";
import { TraceDashboardSchema } from "./schemas";

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
export type HarvestQuery = PageQuery & {
  terroirId?: string;
  phytosanitaryStatus?: string;
  harvestYear?: number;
  /** Id de un lote o `none`: uva recibida sin lote (contrato de la Ola 2 §2.5). */
  lotId?: string;
};
export type TankQuery = PageQuery & {
  status?: string;
  destinationType?: string;
  harvestBatchId?: string;
  lotId?: string;
};
/** Filtros de `GET /v1/lots` (contrato de la Ola 2 §2.5); `stage` admite varias etapas. */
export type LotQuery = PageQuery & {
  stage?: readonly LotStageCode[];
  productType?: LotProductType;
  harvestYear?: number;
  q?: string;
  hasComplianceIssues?: boolean;
  lockDueWithinDays?: number;
};
export type BottleCodeQuery = PageQuery & { status?: BottleUnitStatus; fromSerial?: number; toSerial?: number };
export type SerialRange = { fromSerial?: number; toSerial?: number };
export type ProductionReportQuery = {
  from?: string;
  to?: string;
  productType?: LotProductType;
  stage?: readonly LotStageCode[];
};
export type ProductionQuery = PageQuery & { restStatus?: string };
/** Filtros de la bitácora propia (contrato de la Ola 1 §7): fechas `AAAA-MM-DD` y código de acción. */
export type AuditQuery = { from?: string; to?: string; action?: string; limit: number; offset: number };
export type UploadFolder = "certificates" | "inspections" | "labels" | "lab-reports";

/** `stage=A,B` de las listas de lotes y del reporte. */
const stageParam = (stage?: readonly LotStageCode[]) => (stage && stage.length > 0 ? stage.join(",") : undefined);

const lotQuery = ({ stage, ...q }: LotQuery): Query => ({ ...q, stage: stageParam(stage) });

export const erpApi = {
  // Lote (contrato de la Ola 2 §2): la entidad del servidor que agrupa la cadena.
  lots: (q: LotQuery = {}, s?: AbortSignal) => list("/v1/lots", LotSummarySchema, lotQuery(q), s),
  lot: (id: string, signal?: AbortSignal) => api(`/v1/lots/${id}`, { schema: LotSchema, signal }),
  createLot: (body: Nullable<CreateLotDto>, idempotencyKey?: string) =>
    api("/v1/lots", { method: "POST", body: omitNulls<CreateLotDto>(body), schema: LotSchema, idempotencyKey }),
  updateLot: (id: string, body: UpdateLotDto) => api(`/v1/lots/${id}`, { method: "PATCH", body, schema: LotSchema }),
  discardLot: (id: string, body: DiscardLotDto) =>
    api(`/v1/lots/${id}/discard`, { method: "POST", body, schema: LotSchema }),
  lotTimeline: (id: string, signal?: AbortSignal) =>
    api(`/v1/lots/${id}/timeline`, { schema: LotTimelineSchema, signal }),
  lotGraph: (id: string, signal?: AbortSignal) => api(`/v1/lots/${id}/graph`, { schema: LotGraphSchema, signal }),
  lotBalance: (id: string, signal?: AbortSignal) => api(`/v1/lots/${id}/balance`, { schema: LotBalanceSchema, signal }),

  // Embotellado del lote (§6): la vista previa no escribe nada.
  bottlingPreview: (lotId: string, body: Nullable<CreateLotBottlingDto>, signal?: AbortSignal) =>
    api(`/v1/lots/${lotId}/bottling/preview`, {
      method: "POST",
      body: omitNulls<CreateLotBottlingDto>(body),
      schema: BottlingPreviewSchema,
      signal,
    }),
  createLotBottling: (lotId: string, body: Nullable<CreateLotBottlingDto>, idempotencyKey?: string) =>
    api(`/v1/lots/${lotId}/bottling`, {
      method: "POST",
      body: omitNulls<CreateLotBottlingDto>(body),
      schema: BottlingBatchResponseSchema,
      idempotencyKey,
    }),

  // Códigos de botella (§7)
  bottleCodes: (lotId: string, q: BottleCodeQuery, s?: AbortSignal) =>
    list(`/v1/lots/${lotId}/bottle-codes`, BottleUnitSchema, q, s),
  bottleCodesCsv: (lotId: string, range: SerialRange = {}) =>
    apiFile(`/v1/lots/${lotId}/bottle-codes/export`, { query: { format: "csv", ...range } }),
  createBottleCodeExport: (lotId: string, body: CreateBottleCodeExportDto) =>
    api(`/v1/lots/${lotId}/bottle-codes/exports`, { method: "POST", body, schema: BottleCodeExportAcceptedSchema }),
  bottleCodeExport: (lotId: string, exportId: string, signal?: AbortSignal) =>
    api(`/v1/lots/${lotId}/bottle-codes/exports/${exportId}`, { schema: BottleCodeExportSchema, signal }),
  voidBottleCode: (code: string, body: VoidBottleCodeDto) =>
    api(`/v1/bottle-codes/${encodeURIComponent(code)}/void`, { method: "POST", body, schema: BottleUnitSchema }),

  // Laboratorio del lote (§8): un análisis nuevo sustituye al anterior.
  lotLabAnalyses: (lotId: string, signal?: AbortSignal) =>
    list(`/v1/lots/${lotId}/lab-analyses`, BatchLabAnalysisResponseSchema, {}, signal),
  createLotLabAnalysis: (lotId: string, body: Nullable<CreateLotLabAnalysisDto>) =>
    api(`/v1/lots/${lotId}/lab-analyses`, {
      method: "POST",
      body: omitNulls<CreateLotLabAnalysisDto>(body),
      schema: BatchLabAnalysisResponseSchema,
    }),

  // Correcciones compensatorias (§9): nada se edita ni se borra.
  corrections: (lotId: string, signal?: AbortSignal) =>
    list(`/v1/lots/${lotId}/corrections`, CorrectionSchema, {}, signal),
  createCorrection: (lotId: string, body: CreateLotCorrectionDto) =>
    api(`/v1/lots/${lotId}/corrections`, { method: "POST", body, schema: CorrectionSchema }),
  createTerroirCorrection: (terroirId: string, body: CreateTerroirCorrectionDto) =>
    api(`/v1/terroirs/${terroirId}/corrections`, { method: "POST", body, schema: CorrectionSchema }),

  // Expediente (§10)
  dossierPreview: (lotId: string, signal?: AbortSignal) =>
    api(`/v1/lots/${lotId}/dossier/preview`, { schema: DossierPreviewSchema, signal }),
  dossier: (lotId: string, signal?: AbortSignal) =>
    api(`/v1/lots/${lotId}/dossier`, { schema: LotDossierSchema, signal }),
  closeDossier: (lotId: string, idempotencyKey?: string) =>
    api(`/v1/lots/${lotId}/dossier/close`, {
      method: "POST",
      body: { confirm: true },
      schema: LotDossierSchema,
      idempotencyKey,
    }),
  /** Los bytes exactos que se hashean (JSON canónico), sin el envoltorio. */
  dossierCanonical: (lotId: string) => apiFile(`/v1/lots/${lotId}/dossier/canonical`),

  // Archivos privados del lote (§11.5)
  attachments: (lotId: string, signal?: AbortSignal) =>
    list(`/v1/lots/${lotId}/attachments`, LotAttachmentSchema, {}, signal),
  createAttachment: (lotId: string, body: CreateLotAttachmentDto) =>
    api(`/v1/lots/${lotId}/attachments`, { method: "POST", body, schema: LotAttachmentSchema }),
  changeAttachmentVisibility: (lotId: string, attachmentId: string, body: ChangeLotAttachmentVisibilityDto) =>
    api(`/v1/lots/${lotId}/attachments/${attachmentId}/visibility`, {
      method: "POST",
      body,
      schema: LotAttachmentSchema,
    }),

  // Panel y reportes de la bodega (§11.2, §11.4)
  traceDashboard: (signal?: AbortSignal) => api("/v1/traceability/dashboard", { schema: TraceDashboardSchema, signal }),
  productionReport: ({ stage, ...q }: ProductionReportQuery = {}, signal?: AbortSignal) =>
    api("/v1/traceability/reports/production", {
      query: { ...q, stage: stageParam(stage), format: "json" },
      schema: ProductionReportSchema,
      signal,
    }),
  productionReportCsv: ({ stage, ...q }: ProductionReportQuery = {}) =>
    apiFile("/v1/traceability/reports/production", { query: { ...q, stage: stageParam(stage), format: "csv" } }),

  // Origen
  terroirs: (q: TerroirQuery = {}, s?: AbortSignal) => list("/v1/terroirs", TerroirResponseSchema, q, s),
  terroir: (id: string, signal?: AbortSignal) => api(`/v1/terroirs/${id}`, { schema: TerroirDetailSchema, signal }),
  createTerroir: (body: Nullable<CreateTerroirDto>) =>
    api("/v1/terroirs", { method: "POST", body: omitNulls<CreateTerroirDto>(body), schema: TerroirResponseSchema }),
  updateTerroir: (id: string, body: Nullable<UpdateTerroirDto>) =>
    api(`/v1/terroirs/${id}`, {
      method: "PATCH",
      body: omitNulls<UpdateTerroirDto>(body),
      schema: TerroirResponseSchema,
    }),

  // Vendimia
  harvestBatches: (q: HarvestQuery = {}, s?: AbortSignal) =>
    list("/v1/harvest-batches", HarvestBatchResponseSchema, q, s),
  harvestBatch: (id: string, signal?: AbortSignal) =>
    api(`/v1/harvest-batches/${id}`, { schema: HarvestBatchDetailSchema, signal }),
  createHarvestBatch: (body: Nullable<CreateHarvestBatchDto>, idempotencyKey?: string) =>
    api("/v1/harvest-batches", {
      method: "POST",
      body: omitNulls<CreateHarvestBatchDto>(body),
      schema: HarvestBatchResponseSchema,
      idempotencyKey,
    }),
  // Análisis de madurez y dictamen fitosanitario, aparte del pesaje (§3.3 y §3.4): solo inserción.
  maturityAnalyses: (harvestBatchId: string, signal?: AbortSignal) =>
    list(`/v1/harvest-batches/${harvestBatchId}/maturity-analyses`, MaturityAnalysisSchema, {}, signal),
  createMaturityAnalysis: (harvestBatchId: string, body: Nullable<CreateMaturityAnalysisDto>) =>
    api(`/v1/harvest-batches/${harvestBatchId}/maturity-analyses`, {
      method: "POST",
      body: omitNulls<CreateMaturityAnalysisDto>(body),
      schema: MaturityAnalysisSchema,
    }),
  phytoDecisions: (harvestBatchId: string, signal?: AbortSignal) =>
    list(`/v1/harvest-batches/${harvestBatchId}/phyto-decisions`, PhytoDecisionSchema, {}, signal),
  /** Responde el pesaje completo con su historial de dictámenes (OpenAPI; mocks `CONTRATO.md` §10.1). */
  createPhytoDecision: (harvestBatchId: string, body: Nullable<CreatePhytoDecisionDto>) =>
    api(`/v1/harvest-batches/${harvestBatchId}/phyto-decisions`, {
      method: "POST",
      body: omitNulls<CreatePhytoDecisionDto>(body),
      schema: HarvestBatchDetailSchema,
    }),

  // Vinificación
  tanks: (q: TankQuery = {}, s?: AbortSignal) => list("/v1/fermentation-tanks", FermentationTankResponseSchema, q, s),
  tank: (id: string, signal?: AbortSignal) =>
    api(`/v1/fermentation-tanks/${id}`, { schema: FermentationTankDetailSchema, signal }),
  createTank: (body: Nullable<CreateFermentationTankDto>) =>
    api("/v1/fermentation-tanks", {
      method: "POST",
      body: omitNulls<CreateFermentationTankDto>(body),
      schema: FermentationTankResponseSchema,
    }),
  // Transiciones del tanque por acciones (§4.2); completar decide la bifurcación (§4.3).
  startTank: (id: string, body: StartFermentationTankDto = {}) =>
    api(`/v1/fermentation-tanks/${id}/start`, { method: "POST", body, schema: FermentationTankResponseSchema }),
  completeTank: (id: string, body: CompleteFermentationTankDto) =>
    api(`/v1/fermentation-tanks/${id}/complete`, { method: "POST", body, schema: FermentationTankResponseSchema }),
  cleanTank: (id: string, body: CleanFermentationTankDto = {}) =>
    api(`/v1/fermentation-tanks/${id}/clean`, { method: "POST", body, schema: FermentationTankResponseSchema }),
  addTankLog: (id: string, body: Nullable<CreateFermentationLogDto>, idempotencyKey?: string) =>
    api(`/v1/fermentation-tanks/${id}/logs`, {
      method: "POST",
      body: omitNulls<CreateFermentationLogDto>(body),
      schema: FermentationLogSchema,
      idempotencyKey,
    }),
  addTreatment: (id: string, body: Nullable<CreateEnologicalTreatmentDto>) =>
    api(`/v1/fermentation-tanks/${id}/treatments`, {
      method: "POST",
      body: omitNulls<CreateEnologicalTreatmentDto>(body),
      schema: EnologicalTreatmentSchema,
    }),

  // Crianza
  agings: (q: PageQuery = {}, s?: AbortSignal) => list("/v1/wine-aging", WineAgingResponseSchema, q, s),
  aging: (id: string, signal?: AbortSignal) => api(`/v1/wine-aging/${id}`, { schema: WineAgingResponseSchema, signal }),
  createAging: (body: Nullable<CreateWineAgingBatchDto>) =>
    api("/v1/wine-aging", {
      method: "POST",
      body: omitNulls<CreateWineAgingBatchDto>(body),
      schema: WineAgingResponseSchema,
    }),

  discardAging: (id: string, body: DiscardWineAgingDto) =>
    api(`/v1/wine-aging/${id}/discard`, { method: "POST", body, schema: WineAgingResponseSchema }),

  // Destilación
  productions: (q: ProductionQuery = {}, s?: AbortSignal) =>
    list("/v1/production-batches", ProductionBatchResponseSchema, q, s),
  production: (id: string, signal?: AbortSignal) =>
    api(`/v1/production-batches/${id}`, { schema: ProductionBatchResponseSchema, signal }),
  createDistillation: (body: Nullable<CreateDistillationBatchDto>) =>
    api("/v1/production-batches/distillation", {
      method: "POST",
      body: omitNulls<CreateDistillationBatchDto>(body),
      schema: ProductionBatchResponseSchema,
    }),

  closeDistillation: (id: string, body: Nullable<CloseDistillationDto>) =>
    api(`/v1/production-batches/${id}/close`, {
      method: "POST",
      body: omitNulls<CloseDistillationDto>(body),
      schema: ProductionBatchResponseSchema,
    }),
  discardProduction: (id: string, body: DiscardProductionBatchDto) =>
    api(`/v1/production-batches/${id}/discard`, { method: "POST", body, schema: ProductionBatchResponseSchema }),

  // Envasado, laboratorio y trazabilidad
  bottlings: (q: PageQuery = {}, s?: AbortSignal) => list("/v1/bottling", BottlingBatchResponseSchema, q, s),
  bottling: (id: string, signal?: AbortSignal) =>
    api(`/v1/bottling/${id}`, { schema: BottlingBatchResponseSchema, signal }),

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

  // Archivos privados: se guarda la `key` en los DTO (campos `*Url`) y la URL firmada, que
  // caduca a los 15 min, se pide al mostrar el archivo.
  upload: (file: File, folder: UploadFolder) => {
    const form = new FormData();
    form.append("file", file);
    return api("/v1/uploads", { method: "POST", body: form, query: { folder }, schema: UploadResponseSchema });
  },
  fileUrl: (key: string, signal?: AbortSignal) =>
    api("/v1/uploads/url", { query: { key }, schema: SignedUrlResponseSchema, signal }),
};
