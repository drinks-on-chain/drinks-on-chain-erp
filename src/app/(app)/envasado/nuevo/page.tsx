import { BottlingStart } from "@/features/envasado/bottling-start";

const one = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

// Desde la Ola 2 se embotella el lote (`/lotes/{id}/embotellar`): aquí se elige, o se redirige si
// el enlace ya trae el lote, la crianza o la destilación.
export default async function Page({ searchParams }: PageProps<"/envasado/nuevo">) {
  const sp = await searchParams;
  const preselect = { crianza: one(sp.crianza), destilacion: one(sp.destilacion), lote: one(sp.lote) };
  return <BottlingStart key={JSON.stringify(preselect)} preselect={preselect} />;
}
