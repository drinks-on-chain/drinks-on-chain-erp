import { WeighInScreen } from "@/features/vendimia/components/weigh-in-screen";

// 3.1 Pesaje. `?terroir=<id>` preselecciona la parcela (enlace desde la ficha del terroir).
export default async function WeighInPage({ searchParams }: PageProps<"/vendimia/pesaje">) {
  const { terroir } = await searchParams;
  return <WeighInScreen initialTerroirId={typeof terroir === "string" ? terroir : undefined} />;
}
