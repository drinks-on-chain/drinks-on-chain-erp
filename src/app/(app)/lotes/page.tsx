import { LotList } from "@/features/lotes/lot-list";

// `?incidencias=1` abre la lista filtrada por incidencias de cumplimiento (enlace del panel).
export default async function Page({ searchParams }: PageProps<"/lotes">) {
  const { incidencias } = await searchParams;
  return <LotList issuesOnly={incidencias === "1"} />;
}
