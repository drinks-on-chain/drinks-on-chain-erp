import { LotBottlingScreen } from "@/features/lotes/lot-bottling";

// Embotellado del lote (contrato de la Ola 2 §6): vista previa del balance y alta, una sola vez.
export default async function Page({ params }: PageProps<"/lotes/[id]/embotellar">) {
  const { id } = await params;
  return <LotBottlingScreen lotId={id} />;
}
