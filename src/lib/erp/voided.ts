// Registros anulados por una corrección `VOID` (contrato de la Ola 2 §9, mocks 0.5.0-rc.2): el
// servidor los devuelve marcados (`voided: true`; `voidedAt` en lecturas, tratamientos y análisis de
// laboratorio) en lugar de omitirlos. Se muestran en su historial, pero quedan fuera de cualquier
// cálculo de la pantalla (última lectura, análisis vigente, gráficas).

export type Voidable = { voided?: boolean; voidedAt?: string | null };

export const isVoided = (record: Voidable): boolean => record.voided === true || !!record.voidedAt;

/** Solo los registros que cuentan. */
export const activeOnly = <T extends Voidable>(records: readonly T[] | undefined): T[] =>
  (records ?? []).filter((r) => !isVoided(r));
