import { describe, expect, it } from "vitest";
import { erpFixtures as fx } from "@drinks-on-chain/mocks/fixtures";
import { validateProfile } from "@/features/perfil/profile-model";
import { emptyMember, validateMember, validateWinery, wineryValues } from "./settings-model";

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

describe("validateMember", () => {
  it("arma el alta con correo en minúsculas y opcionales en null", () => {
    const { errors, dto } = validateMember({
      ...emptyMember(),
      fullName: "Ana Cruz",
      email: " Ana@Bodega.test ",
      password: "segura123",
      memberRole: "AGRONOMIST",
    });
    expect(errors).toEqual({});
    expect(dto).toEqual({
      fullName: "Ana Cruz",
      email: "ana@bodega.test",
      password: "segura123",
      memberRole: "AGRONOMIST",
      phoneNumber: null,
      professionalLicenseNumber: null,
    });
  });
  it("pide nombre, correo, contraseña de 8 caracteres y rol", () => {
    const { errors } = validateMember({ ...emptyMember(), password: "corta" });
    expect(Object.keys(errors).sort()).toEqual(["email", "fullName", "memberRole", "password"]);
  });
});

describe("validateProfile", () => {
  it("valida nombre y teléfono", () => {
    expect(validateProfile({ fullName: "Lucía Rojas", phoneNumber: "", preferredLocale: "es" }).dto).toEqual({
      fullName: "Lucía Rojas",
      phoneNumber: null,
      preferredLocale: "es",
    });
    const { errors } = validateProfile({ fullName: "", phoneNumber: "teléfono", preferredLocale: "es" });
    expect(Object.keys(errors).sort()).toEqual(["fullName", "phoneNumber"]);
  });
});
