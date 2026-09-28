import { describe, expect, it } from "vitest";
import { ApiError, NetworkError } from "./errors";
import { fieldErrorsFrom, validationIssues } from "./field-errors";

const validation = (details: unknown, status = 422, code = "VALIDATION_ERROR") =>
  new ApiError({ status, code, message: "Validation failed", details });

describe("validationIssues", () => {
  it("lee la forma del contrato { field, message } con field null", () => {
    expect(
      validationIssues([
        { field: "email", message: "Correo inválido" },
        { field: null, message: "Revisa el formulario" },
      ]),
    ).toEqual([
      { field: "email", message: "Correo inválido" },
      { field: null, message: "Revisa el formulario" },
    ]);
  });

  it('ignora lo que no tiene la forma del contrato (las cadenas "campo: mensaje" se retiraron en H1)', () => {
    expect(validationIssues(["brixDegrees: debe ser un número", { field: "x" }])).toEqual([]);
    expect(validationIssues(null)).toEqual([]);
    expect(validationIssues({ email: "x" })).toEqual([]);
  });
});

describe("fieldErrorsFrom", () => {
  it("marca el campo exacto y deja arriba lo que no es de ningún campo", () => {
    const error = validation([
      { field: "fullName", message: "Obligatorio" },
      { field: "fullName", message: "Segundo mensaje" },
      { field: "desconocido", message: "Otro campo" },
      { field: null, message: "General" },
    ]);
    expect(fieldErrorsFrom(error, ["fullName", "phoneNumber"])).toEqual({
      fieldErrors: { fullName: "Obligatorio" },
      formErrors: ["Otro campo", "General"],
    });
  });

  it("resuelve campos anidados por el prefijo más largo", () => {
    const error = validation([
      { field: "items.0.quantity", message: "Cantidad inválida" },
      { field: "items.1.sku", message: "SKU inválido" },
    ]);
    expect(fieldErrorsFrom(error, ["items.0.quantity", "items"]).fieldErrors).toEqual({
      "items.0.quantity": "Cantidad inválida",
      items: "SKU inválido",
    });
  });

  it("acepta una función que traduce el nombre del backend al del formulario", () => {
    const error = validation(
      [{ field: "grossWeightKg", message: "Debe superar la tara" }],
      422,
      "UNPROCESSABLE_ENTITY",
    );
    const map: Record<string, "gross"> = { grossWeightKg: "gross" };
    expect(fieldErrorsFrom(error, (f) => map[f]).fieldErrors).toEqual({ gross: "Debe superar la tara" });
  });

  it("no reparte nada si el error no es de validación", () => {
    const empty = { fieldErrors: {}, formErrors: [] };
    expect(fieldErrorsFrom(new ApiError({ status: 500, code: "X", message: "x" }), ["a"])).toEqual(empty);
    expect(fieldErrorsFrom(new NetworkError(null), ["a"])).toEqual(empty);
    expect(fieldErrorsFrom(null, ["a"])).toEqual(empty);
  });
});
