import { TankDetail } from "./tank-detail";

// Ficha y bitácora del tanque (09 §3 fila 4.2).
export default async function TankPage({ params }: PageProps<"/vinificacion/[id]">) {
  const { id } = await params;
  return <TankDetail id={id} />;
}
