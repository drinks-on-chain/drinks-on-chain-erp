import type { Metadata } from "next";
import { AuthLayout, BrandSeal, VineyardScene } from "@drinks-on-chain/ui";
import { VerifyEmail } from "@/features/acceso/verify-email";

export const metadata: Metadata = { title: "Verificar correo" };

// Enlace de verificación de correo (contrato de la Ola 1 §1, `POST /v1/auth/verify-email`).
export default async function VerifyEmailPage({ searchParams }: PageProps<"/verificar-correo">) {
  const { token } = await searchParams;
  const value = Array.isArray(token) ? token[0] : token;
  return (
    <AuthLayout
      variant="split"
      brand={<BrandSeal tagline="ERP de trazabilidad" />}
      image={<VineyardScene />}
      title="Verificar correo"
    >
      <VerifyEmail token={value ?? ""} />
    </AuthLayout>
  );
}
