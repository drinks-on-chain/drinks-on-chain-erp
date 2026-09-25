import { BottlingDetail } from "@/features/envasado/bottling-detail";

export default async function Page({ params, searchParams }: PageProps<"/envasado/[id]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  return <BottlingDetail id={id} justCreated={sp.creado === "1"} />;
}
