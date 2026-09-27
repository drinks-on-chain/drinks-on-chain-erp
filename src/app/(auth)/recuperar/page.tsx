import type { Metadata } from "next";
import Link from "next/link";
import { Alert, AuthLayout, BrandSeal, Button, VineyardScene } from "@drinks-on-chain/ui";

export const metadata: Metadata = { title: "Recuperar contraseña" };

// El backend aún no expone recuperación de contraseña (no hay endpoint en el OpenAPI del
// 25-09-2026). Mientras tanto, la administración de la bodega restablece el acceso.
export default function RecoverPage() {
  return (
    <AuthLayout
      variant="split"
      brand={<BrandSeal tagline="ERP de trazabilidad" />}
      image={<VineyardScene />}
      title="Recuperar contraseña"
    >
      <div className="grid grid-cols-1 gap-4">
        <Alert tone="info">
          Pide a la persona que administra tu bodega en el ERP que restablezca tu acceso. Si eres tú, escribe al equipo
          de Drinks on Chain.
        </Alert>
        <Button asChild variant="secondary" size="lg">
          <Link href="/login">Volver a iniciar sesión</Link>
        </Button>
      </div>
    </AuthLayout>
  );
}
