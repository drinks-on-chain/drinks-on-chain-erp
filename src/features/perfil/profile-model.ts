import { UpdateUserSchema } from "@drinks-on-chain/mocks";

export type ProfileValues = { fullName: string; phoneNumber: string; preferredLocale: string };
export type ProfileErrors = Partial<Record<keyof ProfileValues, string>>;

/** Validación del perfil (UpdateUserSchema + teléfono con formato razonable). */
export function validateProfile(v: ProfileValues): {
  errors: ProfileErrors;
  dto: ReturnType<typeof UpdateUserSchema.parse> | null;
} {
  const errors: ProfileErrors = {};
  if (!v.fullName.trim()) errors.fullName = "Indica tu nombre completo.";
  const phone = v.phoneNumber.trim();
  if (phone && !/^\+?[\d\s-]{7,20}$/.test(phone))
    errors.phoneNumber = "Usa solo dígitos, espacios o guiones (p. ej. +591 71234567).";
  if (Object.keys(errors).length) return { errors, dto: null };
  const parsed = UpdateUserSchema.safeParse({
    fullName: v.fullName.trim(),
    phoneNumber: phone || null,
    preferredLocale: v.preferredLocale,
  });
  return parsed.success
    ? { errors, dto: parsed.data }
    : { errors: { fullName: parsed.error.issues[0]?.message }, dto: null };
}
