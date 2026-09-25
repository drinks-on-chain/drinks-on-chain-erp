// Lectura de los `details` de un error 400/422 del backend para pintarlos junto a cada campo.

/**
 * Pares [campo, mensaje] de los `details` del backend: lista de "campo: mensaje" o
 * "campo es obligatorio", u objeto { campo: mensaje }.
 */
export function detailPairs(details: unknown): [string, string][] {
  if (Array.isArray(details)) {
    return details.flatMap((d): [string, string][] => {
      if (typeof d !== "string") return [];
      const m = /^([A-Za-z][\w]*)(?:\.[\w.]+)?(?::\s*|\s+)(.+)$/.exec(d);
      return m ? [[m[1]!, m[2]!]] : [];
    });
  }
  if (details && typeof details === "object") {
    return Object.entries(details).flatMap(([k, v]): [string, string][] =>
      typeof v === "string" ? [[k, v]] : Array.isArray(v) && typeof v[0] === "string" ? [[k, v[0]]] : [],
    );
  }
  return [];
}
