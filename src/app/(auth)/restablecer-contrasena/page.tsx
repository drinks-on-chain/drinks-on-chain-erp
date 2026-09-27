import { redirect } from "next/navigation";

// El correo de recuperación enlaza a `/restablecer-contrasena?token=…` (docs/CONTRATO.md §6 de los
// mocks); la pantalla vive en `/restablecer/{token}`.
export default async function Page({ searchParams }: PageProps<"/restablecer-contrasena">) {
  const { token } = await searchParams;
  const value = Array.isArray(token) ? token[0] : token;
  redirect(value ? `/restablecer/${encodeURIComponent(value)}` : "/recuperar");
}
