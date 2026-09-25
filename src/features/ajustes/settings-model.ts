import {
  CreateMemberSchema,
  UpdateWinerySchema,
  type CreateMemberDto,
  type MemberRole,
  type UpdateWineryDto,
  type WineryResponse,
} from "@drinks-on-chain/mocks";

// Validación de los formularios de ajustes: datos de la bodega (UpdateWinerySchema) y alta
// de miembro con cuenta nueva (CreateMemberSchema, POST /v1/wineries/my/members/create).

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

export const MEMBER_ROLE_OPTIONS: { value: MemberRole; label: string; help: string }[] = [
  { value: "ENOLOGIST", label: "Enología", help: "Vinificación, crianza, destilación y embotellado." },
  { value: "AGRONOMIST", label: "Agronomía", help: "Parcelas, pesaje y dictamen fitosanitario." },
  { value: "OPERATOR", label: "Operario", help: "Registros de planta." },
  { value: "ACCOUNTANT", label: "Contabilidad", help: "Consulta." },
  { value: "OWNER", label: "Dirección", help: "Administra la bodega y su equipo." },
];

export type MemberValues = {
  fullName: string;
  email: string;
  password: string;
  memberRole: MemberRole | "";
  phoneNumber: string;
  professionalLicenseNumber: string;
};
export type MemberErrors = Partial<Record<keyof MemberValues, string>>;

export const emptyMember = (): MemberValues => ({
  fullName: "",
  email: "",
  password: "",
  memberRole: "",
  phoneNumber: "",
  professionalLicenseNumber: "",
});

/** Contraseña inicial mínima para una cuenta nueva (el backend solo exige que no esté vacía). */
export const MIN_PASSWORD = 8;

export function validateMember(v: MemberValues): { errors: MemberErrors; dto: CreateMemberDto | null } {
  const errors: MemberErrors = {};
  if (!v.fullName.trim()) errors.fullName = "Indica el nombre completo.";
  if (!EMAIL.test(v.email.trim())) errors.email = "Indica un correo válido.";
  if (v.password.length < MIN_PASSWORD) errors.password = `Al menos ${MIN_PASSWORD} caracteres.`;
  if (!v.memberRole) errors.memberRole = "Elige el rol en la bodega.";
  if (v.phoneNumber.trim() && !PHONE.test(v.phoneNumber.trim()))
    errors.phoneNumber = "Usa solo dígitos, espacios o guiones.";
  if (Object.keys(errors).length) return { errors, dto: null };
  const parsed = CreateMemberSchema.safeParse({
    fullName: v.fullName.trim(),
    email: v.email.trim().toLowerCase(),
    password: v.password,
    memberRole: v.memberRole,
    phoneNumber: v.phoneNumber.trim() || null,
    professionalLicenseNumber: v.professionalLicenseNumber.trim() || null,
  });
  if (!parsed.success) return { errors: { email: parsed.error.issues[0]?.message }, dto: null };
  return { errors, dto: parsed.data };
}
