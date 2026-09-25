import type { TerroirResponse } from "@drinks-on-chain/mocks";
import { doEligibility } from "./do-eligibility";

// Filtros del directorio de terroirs (búsqueda, cepa y "Apto D.O."), en cliente: la bodega
// tiene pocas parcelas y las pills se construyen con las cepas que existen.

export type TerroirFilters = {
  search?: string;
  variety?: string | null;
  doOnly?: boolean;
};

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/** Cepas presentes, sin repetir y ordenadas, con su número de parcelas. */
export function varietiesOf(items: readonly TerroirResponse[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const t of items) counts.set(t.varietyName, (counts.get(t.varietyName) ?? 0) + 1);
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

/** Nombre corto de la cepa para la pill ("Moscatel" en vez de "Moscatel de Alejandría"). */
export function shortVariety(name: string): string {
  return name.replace(/\s+de\s+.*/i, "");
}

export function filterTerroirs(items: readonly TerroirResponse[], f: TerroirFilters): TerroirResponse[] {
  const q = fold(f.search?.trim() ?? "");
  return items.filter((t) => {
    if (f.variety && t.varietyName !== f.variety) return false;
    if (f.doOnly && !doEligibility(t).eligible) return false;
    if (!q) return true;
    return [t.parcelName, t.varietyName, t.cadastreCode ?? "", t.doType ?? "", t.soilType ?? ""].some((v) =>
      fold(v).includes(q),
    );
  });
}
