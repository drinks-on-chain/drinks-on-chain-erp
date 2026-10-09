import { notFound } from "next/navigation";
import { TokenizationRequestScreen } from "@/features/tokenizacion/tokenization-request-form";
import { env } from "@/lib/env";

// 1K · Autorizar la tokenización del lote o ampliar su cuota; `?solicitud=` edita una con cambios pedidos.
export default async function Page({ params, searchParams }: PageProps<"/lotes/[id]/tokenizar">) {
  if (!env.tokenization) notFound();
  const { id } = await params;
  const { solicitud } = await searchParams;
  return <TokenizationRequestScreen lotId={id} requestId={typeof solicitud === "string" ? solicitud : undefined} />;
}
