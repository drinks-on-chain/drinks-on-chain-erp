import type { Page, PageParams } from "./envelope";

/** Máximo de `limit` que acepta el backend (contrato de la Ola 0 §2: más → 422). */
export const MAX_PAGE_SIZE = 100;

/**
 * Recorre una colección en páginas de `pageSize` (100 como máximo) hasta reunir `total`.
 * Para pantallas que necesitan la lista entera (p. ej. para derivar vistas o filtrar en el
 * cliente). Un backend que devuelve la lista como array acaba en la primera página.
 */
export async function fetchAllPages<T>(
  fetchPage: (params: Required<PageParams>) => Promise<Page<T>>,
  { pageSize = MAX_PAGE_SIZE, maxItems = 10_000 }: { pageSize?: number; maxItems?: number } = {},
): Promise<Page<T>> {
  const limit = Math.min(Math.max(1, pageSize), MAX_PAGE_SIZE);
  const items: T[] = [];
  let total = 0;
  for (let offset = 0; ; offset += limit) {
    const page = await fetchPage({ limit, offset });
    items.push(...page.items);
    total = page.total;
    if (page.items.length === 0 || items.length >= total || items.length >= maxItems) break;
  }
  return { items, total, limit: items.length, offset: 0 };
}
