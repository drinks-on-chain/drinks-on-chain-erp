import type { BottlingBatchResponse } from "@drinks-on-chain/mocks";
import type { SortState } from "@drinks-on-chain/ui";

// Página visible del listado de embotellados. El certificado de laboratorio no tiene endpoint de
// lista (una petición por embotellado): solo se piden los de la página que se ve, no los de todos.

export const BOTTLING_PAGE_SIZE = 20;
export const DEFAULT_BOTTLING_SORT: SortState = { columnId: "date", direction: "desc" };

const KEYS: Record<string, (b: BottlingBatchResponse) => string | number> = {
  lot: (b) => b.internationalLotCode,
  bottles: (b) => b.totalBottlesPackaged,
  date: (b) => b.bottlingDate,
};

/** Ordena como la tabla (columnas `lot`, `bottles` y `date`); sin orden, por fecha descendente. */
export function sortBottlings(
  items: readonly BottlingBatchResponse[],
  sort: SortState | null,
): BottlingBatchResponse[] {
  const { columnId, direction } = sort ?? DEFAULT_BOTTLING_SORT;
  const key = KEYS[columnId] ?? KEYS.date!;
  const sign = direction === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    const x = key(a);
    const y = key(b);
    const cmp = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "es");
    return cmp * sign;
  });
}

/** Embotellados de la página que empieza en `offset`. */
export function bottlingPage(sorted: readonly BottlingBatchResponse[], offset: number, size = BOTTLING_PAGE_SIZE) {
  return sorted.slice(offset, offset + size);
}
