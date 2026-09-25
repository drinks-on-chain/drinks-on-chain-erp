// Claves de TanStack Query del ERP. Todo cuelga de "erp" para invalidar en bloque tras
// una escritura (las entidades están encadenadas: un embotellado cambia el lote, el panel…).
export const erpKeys = {
  all: ["erp"] as const,
  terroirs: (params?: object) => ["erp", "terroirs", params ?? {}] as const,
  terroir: (id: string) => ["erp", "terroirs", "detail", id] as const,
  harvestBatches: (params?: object) => ["erp", "harvest-batches", params ?? {}] as const,
  harvestBatch: (id: string) => ["erp", "harvest-batches", "detail", id] as const,
  tanks: (params?: object) => ["erp", "tanks", params ?? {}] as const,
  tank: (id: string) => ["erp", "tanks", "detail", id] as const,
  agings: (params?: object) => ["erp", "wine-aging", params ?? {}] as const,
  aging: (id: string) => ["erp", "wine-aging", "detail", id] as const,
  productions: (params?: object) => ["erp", "production", params ?? {}] as const,
  production: (id: string) => ["erp", "production", "detail", id] as const,
  restStatus: (id: string) => ["erp", "production", "rest", id] as const,
  bottlings: (params?: object) => ["erp", "bottling", params ?? {}] as const,
  bottling: (id: string) => ["erp", "bottling", "detail", id] as const,
  lab: (bottlingId: string) => ["erp", "lab", bottlingId] as const,
  dag: (bottlingId: string) => ["erp", "dag", bottlingId] as const,
  winery: () => ["erp", "winery"] as const,
  members: () => ["erp", "winery", "members"] as const,
};
