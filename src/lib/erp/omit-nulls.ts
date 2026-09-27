/**
 * Quita los campos `null` del primer nivel de un cuerpo de alta (`POST`). El OpenAPI del backend
 * declara esos campos opcionales pero no anulables: lo que no se rellena no se envía. (Con `null`
 * el backend responde hoy 500 en varias altas, p. ej. `latitude` de una parcela o
 * `waterDilutionLiters` de un embotellado de vino.) Las ediciones (`PATCH`) no pasan por aquí:
 * allí `null` significa "vaciar el campo".
 */
export function omitNulls<T extends object>(body: T): T {
  return Object.fromEntries(Object.entries(body).filter(([, value]) => value !== null)) as T;
}
