import type { Metadata } from "next";
import { AuthLayout } from "@drinks-on-chain/ui";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default function LoginPage() {
  return (
    <AuthLayout variant="centered" eyebrow="Plantilla de aplicación" title="Entrar">
      <LoginForm />
    </AuthLayout>
  );
}
