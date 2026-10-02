import { LotDetail, isLotTab } from "@/features/lotes/lot-detail";

// Ficha del lote. `?pestana=` abre una sección concreta (enlaces del panel y de los avisos).
export default async function Page({ params, searchParams }: PageProps<"/lotes/[id]">) {
  const { id } = await params;
  const { pestana } = await searchParams;
  return <LotDetail id={id} initialTab={isLotTab(pestana) ? pestana : undefined} />;
}
