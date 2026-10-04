import { describe, expect, it, vi } from "vitest";
import { ApiError, NetworkError } from "./errors";
import { createIdempotencyKeys, withIdempotency } from "./idempotency";

function counter() {
  let n = 0;
  return () => `key-${++n}`;
}

describe("Idempotency-Key", () => {
  it("repite la clave del mismo envío y la cambia con otro cuerpo", () => {
    const keys = createIdempotencyKeys(counter());
    expect(keys.keyFor({ kg: 18400 })).toBe("key-1");
    expect(keys.keyFor({ kg: 18400 })).toBe("key-1");
    expect(keys.keyFor({ kg: 18500 })).toBe("key-2");
  });

  it("tras una respuesta del servidor (correcta o de error), el siguiente envío estrena clave", () => {
    const keys = createIdempotencyKeys(counter());
    expect(keys.keyFor({ a: 1 })).toBe("key-1");
    keys.settle();
    expect(keys.keyFor({ a: 1 })).toBe("key-2");
    keys.settle(new ApiError({ status: 422, code: "TRC_LOCK_NOT_RELEASED", message: "candado" }));
    expect(keys.keyFor({ a: 1 })).toBe("key-3");
  });

  it("sin respuesta (red caída), el reintento es el mismo envío", async () => {
    const keys = createIdempotencyKeys(counter());
    const send = vi
      .fn<(body: { kg: number }, key: string) => Promise<string>>()
      .mockRejectedValueOnce(new NetworkError(new Error("offline")))
      .mockResolvedValueOnce("ok")
      .mockResolvedValueOnce("ok");
    const mutate = withIdempotency(keys, (body: { kg: number }) => body, send);

    await expect(mutate({ kg: 18400 })).rejects.toBeInstanceOf(NetworkError);
    await expect(mutate({ kg: 18400 })).resolves.toBe("ok");
    await mutate({ kg: 18400 });
    expect(send.mock.calls.map(([, key]) => key)).toEqual(["key-1", "key-1", "key-2"]);
  });
});
