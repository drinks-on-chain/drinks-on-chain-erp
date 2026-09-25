// Convierte el polígono GeoJSON de una parcela en puntos de un SVG (caja 0–100) para el
// mapa estilizado de la tarjeta. No es cartografía: solo la silueta, centrada y con el norte arriba.

type Geometry = { type: string; coordinates: unknown[] } | null | undefined;
type Point = [number, number];

const isPoint = (p: unknown): p is Point =>
  Array.isArray(p) && p.length >= 2 && typeof p[0] === "number" && typeof p[1] === "number";

/** Primer anillo exterior de un Polygon o MultiPolygon; null si la geometría no sirve. */
export function outerRing(geometry: Geometry): Point[] | null {
  if (!geometry || !Array.isArray(geometry.coordinates)) return null;
  let ring: unknown;
  if (geometry.type === "Polygon") ring = geometry.coordinates[0];
  else if (geometry.type === "MultiPolygon") ring = (geometry.coordinates[0] as unknown[] | undefined)?.[0];
  else return null;
  if (!Array.isArray(ring)) return null;
  const points = ring.filter(isPoint).map((p) => [p[0], p[1]] as Point);
  return points.length >= 3 ? points : null;
}

/** Puntos "x,y x,y …" en una caja de `size` con margen, conservando la proporción. */
export function ringToSvgPoints(ring: Point[], size = 100, padding = 18): string {
  const xs = ring.map((p) => p[0]);
  const ys = ring.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY) || 1;
  const scale = (size - padding * 2) / span;
  const offX = (size - (maxX - minX) * scale) / 2;
  const offY = (size - (maxY - minY) * scale) / 2;
  const round = (n: number) => Math.round(n * 10) / 10;
  return ring.map(([x, y]) => `${round(offX + (x - minX) * scale)},${round(offY + (maxY - y) * scale)}`).join(" ");
}
