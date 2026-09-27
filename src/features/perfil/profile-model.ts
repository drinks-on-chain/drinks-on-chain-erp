import { DEFAULT_NOTIFICATION_PREFS, UpdateUserSchema, type MeUser, type UpdateUserDto } from "@drinks-on-chain/mocks";

export type ProfileValues = { fullName: string; phoneNumber: string };
export type ProfileErrors = Partial<Record<keyof ProfileValues, string>>;

/** Validación de los datos personales (UpdateUserSchema + teléfono con formato razonable). */
export function validateProfile(v: ProfileValues): {
  errors: ProfileErrors;
  dto: UpdateUserDto | null;
} {
  const errors: ProfileErrors = {};
  if (!v.fullName.trim()) errors.fullName = "Indica tu nombre completo.";
  const phone = v.phoneNumber.trim();
  if (phone && !/^\+?[\d\s-]{7,20}$/.test(phone))
    errors.phoneNumber = "Usa solo dígitos, espacios o guiones (p. ej. +591 71234567).";
  if (Object.keys(errors).length) return { errors, dto: null };
  const parsed = UpdateUserSchema.safeParse({ fullName: v.fullName.trim(), phoneNumber: phone || null });
  return parsed.success
    ? { errors, dto: parsed.data }
    : { errors: { fullName: parsed.error.issues[0]?.message }, dto: null };
}

// Preferencias (contrato de la Ola 1 §1, IAM-09): idioma de los correos, avisos del avance de los
// lotes y consentimiento de promociones. Los recordatorios de canje son de los consumidores.

export type PreferenceValues = { preferredLocale: string; lotProgress: boolean; promotionsConsent: boolean };

export const LOCALES = [
  { value: "es", label: "Español" },
  { value: "en", label: "English" },
];

/** Valores actuales; sin preferencias guardadas, los de por defecto (avisos sí, promociones no). */
export const preferenceValues = (user: MeUser): PreferenceValues => ({
  preferredLocale: user.preferredLocale || "es",
  lotProgress: user.notificationPrefs?.lotProgress ?? DEFAULT_NOTIFICATION_PREFS.lotProgress,
  promotionsConsent: user.promotionsConsent ?? false,
});

/** `PATCH /v1/users/me` con solo lo que cambió (`notificationPrefs` admite cambios parciales). */
export function preferencesDto(initial: PreferenceValues, v: PreferenceValues): UpdateUserDto {
  const dto: UpdateUserDto = {};
  if (v.preferredLocale !== initial.preferredLocale) dto.preferredLocale = v.preferredLocale;
  if (v.lotProgress !== initial.lotProgress) dto.notificationPrefs = { lotProgress: v.lotProgress };
  if (v.promotionsConsent !== initial.promotionsConsent) dto.promotionsConsent = v.promotionsConsent;
  return dto;
}
