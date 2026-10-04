import { NetworkError } from "./errors";

// `Idempotency-Key` (contrato de la Ola 0 §3): la misma clave con el mismo cuerpo devuelve la
// respuesta ya guardada en lugar de repetir la escritura. Sirve para el reintento de un envío que
// se quedó sin respuesta (tabletas de planta con mala red): se repite la clave. En cuanto el
// servidor responde (bien o con un error), el siguiente envío es otro y lleva otra clave.

export type IdempotencyKeys = {
  /** Clave del envío de este cuerpo: la misma mientras no haya respuesta del servidor. */
  keyFor: (body: unknown) => string;
  /** El servidor respondió: el siguiente envío estrena clave. */
  settle: (error?: unknown) => void;
};

export function createIdempotencyKeys(newKey: () => string = () => crypto.randomUUID()): IdempotencyKeys {
  let pending: { fingerprint: string; key: string } | null = null;
  return {
    keyFor(body) {
      const fingerprint = JSON.stringify(body) ?? "";
      if (pending?.fingerprint !== fingerprint) pending = { fingerprint, key: newKey() };
      return pending.key;
    },
    settle(error) {
      // Sin respuesta (red caída): se conserva para que el reintento sea el mismo envío.
      if (error instanceof NetworkError) return;
      pending = null;
    },
  };
}

/**
 * Envuelve una escritura para que lleve su clave de idempotencia: `send(vars, key)` recibe la
 * clave del envío y `body(vars)` dice qué cuerpo la identifica.
 */
export function withIdempotency<TVars, TData>(
  keys: IdempotencyKeys,
  body: (vars: TVars) => unknown,
  send: (vars: TVars, key: string) => Promise<TData>,
): (vars: TVars) => Promise<TData> {
  return async (vars) => {
    try {
      const data = await send(vars, keys.keyFor(body(vars)));
      keys.settle();
      return data;
    } catch (error) {
      keys.settle(error);
      throw error;
    }
  };
}
