import { describe, expect, it } from "vitest";
import type { MeUser } from "@drinks-on-chain/mocks";
import { preferenceValues, preferencesDto, validateProfile } from "./profile-model";

describe("validateProfile", () => {
  it("valida nombre y teléfono", () => {
    expect(validateProfile({ fullName: "Lucía Rojas", phoneNumber: "" }).dto).toEqual({
      fullName: "Lucía Rojas",
      phoneNumber: null,
    });
    const { errors } = validateProfile({ fullName: "", phoneNumber: "teléfono" });
    expect(Object.keys(errors).sort()).toEqual(["fullName", "phoneNumber"]);
  });
});

describe("preferencias", () => {
  const user = (over: Partial<MeUser> = {}) => ({ preferredLocale: "es", ...over }) as MeUser;

  it("sin preferencias guardadas: avisos sí, promociones no", () => {
    expect(preferenceValues(user())).toEqual({ preferredLocale: "es", lotProgress: true, promotionsConsent: false });
    expect(
      preferenceValues(
        user({
          preferredLocale: "en",
          notificationPrefs: { lotProgress: false, redemptionReminders: true },
          promotionsConsent: true,
        }),
      ),
    ).toEqual({ preferredLocale: "en", lotProgress: false, promotionsConsent: true });
  });

  it("envía solo lo que cambió", () => {
    const initial = { preferredLocale: "es", lotProgress: true, promotionsConsent: false };
    expect(preferencesDto(initial, initial)).toEqual({});
    expect(preferencesDto(initial, { ...initial, lotProgress: false, promotionsConsent: true })).toEqual({
      notificationPrefs: { lotProgress: false },
      promotionsConsent: true,
    });
    expect(preferencesDto(initial, { ...initial, preferredLocale: "en" })).toEqual({ preferredLocale: "en" });
  });
});
