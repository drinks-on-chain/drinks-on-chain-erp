import { UpdateWinerySchema, type UpdateWineryDto, type WineryResponse } from "@drinks-on-chain/mocks";

// Validación del formulario de ajustes: datos de la bodega (UpdateWinerySchema). El equipo se
// gestiona con invitaciones en /equipo (contrato de la Ola 1 §2 y §5).

const PHONE = /^\+?[\d\s-]{7,20}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type WineryValues = { commercialName: string; address: string; contactEmail: string; contactPhone: string };
export type WineryErrors = Partial<Record<keyof WineryValues, string>>;

export const wineryValues = (w: WineryResponse): WineryValues => ({
  commercialName: w.commercialName,
  address: w.address ?? "",
  contactEmail: w.contactEmail,
  contactPhone: w.contactPhone ?? "",
});

export function validateWinery(v: WineryValues): { errors: WineryErrors; dto: UpdateWineryDto | null } {
  const errors: WineryErrors = {};
  if (!v.commercialName.trim()) errors.commercialName = "Indica el nombre comercial.";
  if (!EMAIL.test(v.contactEmail.trim())) errors.contactEmail = "Indica un correo de contacto válido.";
  if (v.contactPhone.trim() && !PHONE.test(v.contactPhone.trim()))
    errors.contactPhone = "Usa solo dígitos, espacios o guiones.";
  if (Object.keys(errors).length) return { errors, dto: null };
  const parsed = UpdateWinerySchema.safeParse({
    commercialName: v.commercialName.trim(),
    address: v.address.trim() || null,
    contactEmail: v.contactEmail.trim(),
    contactPhone: v.contactPhone.trim() || null,
  });
  if (!parsed.success) return { errors: { contactEmail: parsed.error.issues[0]?.message }, dto: null };
  return { errors, dto: parsed.data };
}
