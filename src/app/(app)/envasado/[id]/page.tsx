import { BottlingDetail } from "@/features/envasado/bottling-detail";

export default async function Page({ params }: PageProps<"/envasado/[id]">) {
  const { id } = await params;
  return <BottlingDetail id={id} />;
}
