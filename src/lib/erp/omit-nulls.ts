/**
 * Borrador de un cuerpo de alta tal como lo arman los formularios: los opcionales vacíos van en
 * `null`. El OpenAPI del backend (y los esquemas `Create*` de los mocks desde 0.4.0-rc.1) los
 * declara opcionales pero no anulables: antes de enviar o validar se quitan con `omitNulls`.
 */
export type Nullable<T> = { [K in keyof T]: undefined extends T[K] ? T[K] | null : T[K] };

/**
 * Quita los campos `null` del primer nivel de un cuerpo: lo que no se rellena no se envía. Vale
 * para las altas (`POST`) y para las ediciones de parcelas: el backend trata `null` como omitido
 * en los opcionales de trazabilidad, así que tampoco se envía en un `PATCH`.
 */
export function omitNulls<T extends object>(body: Nullable<T>): T {
  return Object.fromEntries(Object.entries(body).filter(([, value]) => value !== null)) as T;
}
