import type { Metadata } from "next";
import { AuthLayout } from "@drinks-on-chain/ui";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Iniciar sesión" };

// Login dividido del ERP (01-erp.html §03): sin registro público; los usuarios los crea
// la bodega o el equipo gestor.
export default function LoginPage() {
  return (
    <AuthLayout
      variant="split"
      eyebrow="ERP de trazabilidad"
      title="Iniciar sesión"
      imageCaption={
        <>
          <span className="block text-2xs tracking-label uppercase">Valle de Cinti · 2.350 m</span>
          <span className="font-display text-xl">La verdad física del producto, de la tierra a la botella.</span>
        </>
      }
      footer="Acceso exclusivo para bodegas asociadas. Si tu bodega no tiene credenciales, contacta con el equipo de Drinks on Chain."
    >
      <LoginForm />
    </AuthLayout>
  );
}
