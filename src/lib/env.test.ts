import { describe, expect, it } from "vitest";
import { TURNSTILE_TEST_SITE_KEY, captchaMode, resolveApiOrigin, tokenizationEnabled } from "./env";

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

describe("captchaMode (Turnstile, contrato de la Ola 1 §0)", () => {
  it("con clave, siempre Turnstile", () => {
    expect(captchaMode({ siteKey: "0x4AAA", mocks: true, production: true })).toEqual({
      kind: "turnstile",
      siteKey: "0x4AAA",
    });
  });

  it("sin clave: valor de prueba con mocks, clave de prueba en desarrollo, nada en producción", () => {
    expect(captchaMode({ siteKey: "", mocks: true, production: true })).toEqual({ kind: "mock" });
    expect(captchaMode({ siteKey: "", mocks: false, production: false })).toEqual({
      kind: "turnstile",
      siteKey: TURNSTILE_TEST_SITE_KEY,
    });
    expect(captchaMode({ siteKey: "", mocks: false, production: true })).toEqual({ kind: "missing" });
  });
});

describe("tokenizationEnabled (NEXT_PUBLIC_ERP_TOKENIZATION, contrato de la Ola 3 §12.1)", () => {
  it("1 la activa y 0 la apaga, con mocks o sin ellos", () => {
    expect(tokenizationEnabled({ flag: "1", mocks: false })).toBe(true);
    expect(tokenizationEnabled({ flag: " 1 ", mocks: false })).toBe(true);
    expect(tokenizationEnabled({ flag: "0", mocks: true })).toBe(false);
  });

  it("sin definir: activa con mocks, apagada contra el backend real", () => {
    expect(tokenizationEnabled({ flag: undefined, mocks: true })).toBe(true);
    expect(tokenizationEnabled({ flag: "", mocks: false })).toBe(false);
    expect(tokenizationEnabled({ flag: undefined, mocks: false })).toBe(false);
  });
});
