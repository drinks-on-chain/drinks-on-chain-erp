import { describe, expect, it } from "vitest";
import { resolveApiOrigin } from "./env";

describe("resolveApiOrigin (API_ORIGIN, P-1)", () => {
  it("normaliza la barra y el /v1 finales", () => {
    expect(resolveApiOrigin({ API_ORIGIN: "https://api.ejemplo.bo/" })).toBe("https://api.ejemplo.bo");
    expect(resolveApiOrigin({ API_ORIGIN: " https://api.ejemplo.bo/v1/ " })).toBe("https://api.ejemplo.bo");
    expect(resolveApiOrigin({ API_ORIGIN: "http://localhost:4000" })).toBe("http://localhost:4000");
  });

  it("con mocks no hace falta", () => {
    expect(resolveApiOrigin({ NEXT_PUBLIC_MOCKS: "1" })).toBeNull();
  });

  it("sin mocks es obligatoria y debe ser http(s)", () => {
    expect(() => resolveApiOrigin({})).toThrow(/API_ORIGIN/);
    expect(() => resolveApiOrigin({ API_ORIGIN: "api.ejemplo.bo" })).toThrow(/URL/);
    expect(() => resolveApiOrigin({ API_ORIGIN: "ftp://api.ejemplo.bo" })).toThrow(/http/);
  });
});
