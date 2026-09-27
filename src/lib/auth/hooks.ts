"use client";

import { useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MeResponse } from "@drinks-on-chain/mocks";
import { getSessionStatus, subscribeSession, type SessionStatus } from "@/lib/api/session";
import { fetchMe, login, logout, switchOrganization, updateMe } from "./api";

/** Estado de la sesión; `null` durante el render del servidor (desconocido). */
export function useSessionStatus(): SessionStatus | null {
  return useSyncExternalStore(subscribeSession, getSessionStatus, () => null);
}

/** true / false en el cliente; null mientras se desconoce (servidor o renovando al arrancar). */
export function useIsAuthenticated(): boolean | null {
  const status = useSessionStatus();
  return status === null || status === "unknown" ? null : status === "authenticated";
}

export const meQueryKey = ["users", "me"] as const;

/** `GET /v1/users/me` con membresías y organización activa. */
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

/** Cierra la sesión (revocación en el backend y después local) y vacía la caché. */
export function useLogout() {
  const client = useQueryClient();
  return async () => {
    await logout();
    client.clear();
  };
}

const isMeQuery = (key: readonly unknown[]) => key[0] === meQueryKey[0] && key[1] === meQueryKey[1];

/**
 * Cambia la organización activa. Los datos de la anterior no deben verse ni un instante: se
 * descartan las consultas inactivas y se reinician las activas (vuelven a cargar con el token
 * nuevo). `me` se actualiza al momento con la respuesta (membresías y organización activa) y
 * se vuelve a leer en segundo plano, así el shell no se desmonta.
 */
export function useSwitchOrganization() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: switchOrganization,
    onSuccess: async (session) => {
      const me = client.getQueryData<MeResponse>(meQueryKey);
      if (me) {
        client.setQueryData<MeResponse>(meQueryKey, {
          ...me,
          memberships: session.memberships,
          activeOrganizationId: session.activeOrganizationId,
        });
      }
      client.removeQueries({ type: "inactive", predicate: (q) => !isMeQuery(q.queryKey) });
      await client.resetQueries({ predicate: (q) => !isMeQuery(q.queryKey) });
      void client.invalidateQueries({ queryKey: meQueryKey });
    },
  });
}

/** `PATCH /v1/users/me`: guarda el perfil y vuelve a leer `me`. */
export function useUpdateMe() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: updateMe,
    onSuccess: () => client.invalidateQueries({ queryKey: meQueryKey }),
  });
}
