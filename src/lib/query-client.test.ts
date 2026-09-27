import { describe, expect, it } from "vitest";
import { ApiError, ContractError, NetworkError } from "@/lib/api/errors";
import { makeQueryClient } from "./query-client";

describe("makeQueryClient · reintentos", () => {
  const retry = makeQueryClient().getDefaultOptions().queries!.retry as (n: number, e: unknown) => boolean;

  it("no reintenta una respuesta que no cumple el contrato ni un 4xx", () => {
    expect(retry(0, new ContractError("/v1/terroirs", []))).toBe(false);
    expect(retry(0, new ApiError({ status: 404, code: "NOT_FOUND", message: "x" }))).toBe(false);
  });

  it("reintenta dos veces los fallos de red y 5xx", () => {
    expect(retry(0, new NetworkError(null))).toBe(true);
    expect(retry(1, new ApiError({ status: 503, code: "HTTP_503", message: "x" }))).toBe(true);
    expect(retry(2, new NetworkError(null))).toBe(false);
  });
});
