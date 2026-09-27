import { describe, expect, it } from "vitest";
import { erpFixtures as fx } from "@drinks-on-chain/mocks/fixtures";
import { validateWinery, wineryValues } from "./settings-model";

describe("validateWinery", () => {
  const winery = fx.wineries[0]!;
  it("parte de los datos actuales y arma el PATCH", () => {
    const { errors, dto } = validateWinery({ ...wineryValues(winery), address: "  " });
    expect(errors).toEqual({});
    expect(dto).toMatchObject({
      commercialName: winery.commercialName,
      address: null,
      contactEmail: winery.contactEmail,
    });
  });
  it("exige nombre y correo válidos", () => {
    const { errors, dto } = validateWinery({
      commercialName: " ",
      contactEmail: "x@",
      address: "",
      contactPhone: "abc",
    });
    expect(dto).toBeNull();
    expect(Object.keys(errors).sort()).toEqual(["commercialName", "contactEmail", "contactPhone"]);
  });
});
