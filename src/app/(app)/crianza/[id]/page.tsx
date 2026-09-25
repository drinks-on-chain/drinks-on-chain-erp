import { AgingDetail } from "./aging-detail";

// Detalle de crianza con su candado (09 §3 fila 5.1A).
export default async function AgingPage({ params }: PageProps<"/crianza/[id]">) {
  const { id } = await params;
  return <AgingDetail id={id} />;
}
