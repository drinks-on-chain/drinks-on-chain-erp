import type { Metadata } from "next";
import { AuthLayout, BrandSeal, VineyardScene } from "@drinks-on-chain/ui";
import { InvitationAccept } from "@/features/acceso/invitation-accept";

export const metadata: Metadata = { title: "Invitación" };

// Enlace del correo de invitación (contrato de la Ola 1 §2): unirse al equipo de una bodega.
export default async function InvitationPage({ params }: PageProps<"/invitacion/[token]">) {
  const { token } = await params;
  return (
    <AuthLayout
      variant="split"
      brand={<BrandSeal tagline="ERP de trazabilidad" />}
      image={<VineyardScene />}
      title="Únete a tu bodega"
    >
      <InvitationAccept token={token} />
    </AuthLayout>
  );
}
