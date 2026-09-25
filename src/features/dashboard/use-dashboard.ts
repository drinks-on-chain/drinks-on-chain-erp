"use client";

import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { useLotViews } from "@/lib/erp/hooks";
import { erpKeys } from "@/lib/erp/keys";
import { erpApi } from "@/lib/erp/resources";
import { today } from "@/lib/erp/today";
import { buildDashboard } from "./build-dashboard";

export function useDashboard() {
  const lots = useLotViews();
  const fermentingIds = (lots.chain?.tanks ?? []).filter((t) => t.status === "FERMENTING").map((t) => t.id);
  const details = useQueries({
    queries: fermentingIds.map((id) => ({
      queryKey: erpKeys.tank(id),
      queryFn: ({ signal }: { signal: AbortSignal }) => erpApi.tank(id, signal),
    })),
  });
  const detailsReady = details.every((d) => d.isSuccess);
  const detailsKey = details.map((d) => d.dataUpdatedAt).join(",");

  const data = useMemo(() => {
    if (!lots.data || !lots.chain || !detailsReady) return undefined;
    return buildDashboard({
      chain: lots.chain,
      lots: lots.data,
      tankDetails: details.map((d) => d.data!),
      today: today(),
    });
    // `details` cambia de identidad en cada render; `detailsKey` refleja sus datos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lots.data, lots.chain, detailsReady, detailsKey]);

  return {
    data,
    isPending: lots.isPending || details.some((d) => d.isPending),
    isError: lots.isError || details.some((d) => d.isError),
    error: lots.error ?? details.find((d) => d.error)?.error ?? null,
    isFetching: lots.isFetching || details.some((d) => d.isFetching),
    // Reintenta también el detalle de los tanques: si solo fallaba ese, el panel no salía del error.
    refetch: () => Promise.all([lots.refetch(), ...details.map((d) => d.refetch())]),
  };
}
