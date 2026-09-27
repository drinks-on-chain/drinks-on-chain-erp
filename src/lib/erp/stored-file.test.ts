import { describe, expect, it } from "vitest";
import { isStorageKey, storedFileName } from "./stored-file";

describe("archivos guardados", () => {
  it("distingue una clave del almacenamiento de una URL o una ruta", () => {
    expect(isStorageKey("org/bd7b/certificates/2026/09/5f1c.pdf")).toBe(true);
    expect(isStorageKey("https://s3.example/doc/x.pdf?X-Amz-Signature=1")).toBe(false);
    expect(isStorageKey("/mocks/uploads/certificado.pdf")).toBe(false);
    expect(isStorageKey("//cdn.example/x.pdf")).toBe(false);
    expect(isStorageKey("data:application/pdf;base64,AAAA")).toBe(false);
  });

  it("nombre legible sin la consulta firmada", () => {
    expect(storedFileName("org/bd7b/labels/2026/09/5f1c.png")).toBe("5f1c.png");
    expect(storedFileName("https://s3.example/doc/1690000000-informe%20final.pdf?X-Amz-Signature=1")).toBe(
      "informe final.pdf",
    );
  });
});
