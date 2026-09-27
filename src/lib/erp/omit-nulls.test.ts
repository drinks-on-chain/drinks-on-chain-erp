import { describe, expect, it } from "vitest";
import { omitNulls } from "./omit-nulls";

describe("omitNulls", () => {
  it("quita los null del primer nivel y conserva el resto (0, false, cadenas vacías, objetos)", () => {
    const body = {
      parcelName: "E2E",
      latitude: null,
      surfaceHectares: 0,
      isDoEligible: false,
      notes: "",
      additionalParams: { heartYieldLiters: null },
    };
    expect(omitNulls(body)).toEqual({
      parcelName: "E2E",
      surfaceHectares: 0,
      isDoEligible: false,
      notes: "",
      additionalParams: { heartYieldLiters: null },
    });
  });
});
