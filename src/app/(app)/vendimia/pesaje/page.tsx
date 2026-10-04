import { WeighInScreen } from "@/features/vendimia/components/weigh-in-screen";

// 3.1 Pesaje. `?terroir=<id>` preselecciona la parcela (enlace desde la ficha del terroir) y
// `?lote=<id>`, el lote (enlace desde la ficha del lote).
export default async function WeighInPage({ searchParams }: PageProps<"/vendimia/pesaje">) {
  const { terroir, lote } = await searchParams;
  return (
    <WeighInScreen
      initialTerroirId={typeof terroir === "string" ? terroir : undefined}
      initialLotId={typeof lote === "string" ? lote : undefined}
    />
  );
}
