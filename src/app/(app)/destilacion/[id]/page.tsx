import { DistillationDetail } from "./distillation-detail";

// Cortes y candado de reposo de una destilación (09 §3 filas 5.1B y 5.2B).
export default async function DistillationPage({ params }: PageProps<"/destilacion/[id]">) {
  const { id } = await params;
  return <DistillationDetail id={id} />;
}
