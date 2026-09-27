import type { Metadata } from "next";
import { AuthLayout, BrandSeal, VineyardScene } from "@drinks-on-chain/ui";
import { ResetForm } from "@/features/acceso/reset-form";

export const metadata: Metadata = { title: "Nueva contraseña" };

// Enlace de recuperación (contrato de la Ola 1 §1): elegir la contraseña nueva.
export default async function ResetPage({ params }: PageProps<"/restablecer/[token]">) {
  const { token } = await params;
  return (
    <AuthLayout
      variant="split"
      brand={<BrandSeal tagline="ERP de trazabilidad" />}
      image={<VineyardScene />}
      title="Elige una contraseña nueva"
    >
      <ResetForm token={token} />
    </AuthLayout>
  );
}
