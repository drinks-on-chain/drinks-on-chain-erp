"use client";

import { useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getTokens, subscribeSession } from "@/lib/api/session";
import { fetchMe, login, logout } from "./api";

/** true / false en el cliente; null durante el render del servidor (sesión desconocida). */
export function useIsAuthenticated(): boolean | null {
  return useSyncExternalStore(
    subscribeSession,
    () => getTokens() !== null,
    () => null,
  );
}

export const meQueryKey = ["users", "me"] as const;

export function useMe(enabled = true) {
  return useQuery({ queryKey: meQueryKey, queryFn: ({ signal }) => fetchMe(signal), enabled });
}

export function useLogin() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: login,
    onSuccess: () => client.removeQueries(),
  });
}

export function useLogout() {
  const client = useQueryClient();
  return () => {
    logout();
    client.clear();
  };
}
