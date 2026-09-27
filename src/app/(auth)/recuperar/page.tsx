import type { Metadata } from "next";
import { AuthLayout, BrandSeal, VineyardScene } from "@drinks-on-chain/ui";
import { RecoverForm } from "@/features/acceso/recover-form";

export const metadata: Metadata = { title: "Recuperar contraseña" };

// Recuperación de contraseña (contrato de la Ola 1 §1, IAM-06): enlace de un solo uso por correo.
export default function RecoverPage() {
  return (
    <AuthLayout
      variant="split"
      brand={<BrandSeal tagline="ERP de trazabilidad" />}
      image={<VineyardScene />}
      title="Recuperar contraseña"
    >
      <RecoverForm />
    </AuthLayout>
  );
}
