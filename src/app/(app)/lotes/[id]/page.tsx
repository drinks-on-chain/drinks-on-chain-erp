import { LotDetail } from "@/features/lotes/lot-detail";

export default async function Page({ params }: PageProps<"/lotes/[id]">) {
  const { id } = await params;
  return <LotDetail id={id} />;
}
