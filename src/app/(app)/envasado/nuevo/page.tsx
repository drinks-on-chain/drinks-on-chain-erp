import { BottlingForm } from "@/features/envasado/bottling-form";

const one = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

export default async function Page({ searchParams }: PageProps<"/envasado/nuevo">) {
  const sp = await searchParams;
  const preselect = { crianza: one(sp.crianza), destilacion: one(sp.destilacion), lote: one(sp.lote) };
  return <BottlingForm key={JSON.stringify(preselect)} preselect={preselect} />;
}
