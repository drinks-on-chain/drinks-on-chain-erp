import { notFound } from "next/navigation";
import { RequestPage } from "@/features/tokenizacion/requests-page";
import { env } from "@/lib/env";

// 1K · Una solicitud de tokenización con su historial.
export default async function Page({ params }: PageProps<"/tokenizacion/[id]">) {
  if (!env.tokenization) notFound();
  const { id } = await params;
  return <RequestPage id={id} />;
}
