import { notFound } from "next/navigation";
import { RequestsPage } from "@/features/tokenizacion/requests-page";
import { env } from "@/lib/env";

// 1K · Solicitudes de tokenización de la bodega (detrás de NEXT_PUBLIC_ERP_TOKENIZATION).
export default function Page() {
  if (!env.tokenization) notFound();
  return <RequestsPage />;
}
