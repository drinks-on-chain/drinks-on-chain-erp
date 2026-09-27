"use client";

import { useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AcceptInvitationDto, LoginDto, MeResponse } from "@drinks-on-chain/mocks";
import { getSessionStatus, subscribeSession, type SessionStatus } from "@/lib/api/session";
import { meQueryKey } from "./keys";
import { clearOrgInactive, getOrgInactiveFlag, subscribeOrgInactive } from "./org-status";
import {
  acceptInvitation,
  changePassword,
  fetchInvitation,
  fetchMe,
  forgotPassword,
  login,
  logout,
  resetPassword,
  switchOrganization,
  updateMe,
  verifyEmail,
} from "./api";

/** Estado de la sesión; `null` durante el render del servidor (desconocido). */
export function useSessionStatus(): SessionStatus | null {
  return useSyncExternalStore(subscribeSession, getSessionStatus, () => null);
}

/** true / false en el cliente; null mientras se desconoce (servidor o renovando al arrancar). */
export function useIsAuthenticated(): boolean | null {
  const status = useSessionStatus();
  return status === null || status === "unknown" ? null : status === "authenticated";
}

export { meQueryKey };

/** `GET /v1/users/me` con membresías y organización activa. */
export function useMe(enabled = true) {
  return useQuery({ queryKey: meQueryKey, queryFn: ({ signal }) => fetchMe(signal), enabled });
}

export function useLogin() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: login,
    onSuccess: () => {
      clearOrgInactive();
      client.removeQueries();
    },
  });
}

/** Cierra la sesión (revocación en el backend y después local) y vacía la caché. */
export function useLogout() {
  const client = useQueryClient();
  return async () => {
    await logout();
    clearOrgInactive();
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
      clearOrgInactive();
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

/**
 * `PATCH /v1/users/me`: guarda perfil y preferencias. Si la respuesta trae `me` completo
 * (contrato de la Ola 1) se usa tal cual; si solo trae el perfil, se vuelve a leer `me`.
 */
export function useUpdateMe() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: updateMe,
    onSuccess: (me) => {
      if (me) client.setQueryData<MeResponse>(meQueryKey, me);
      return client.invalidateQueries({ queryKey: meQueryKey });
    },
  });
}

/** `POST /v1/users/me/password`: el backend cierra las demás sesiones; esta sigue abierta. */
export const useChangePassword = () => useMutation({ mutationFn: changePassword });

/** `POST /v1/auth/forgot-password` (público, con captcha). */
export const useForgotPassword = () => useMutation({ mutationFn: forgotPassword });

/** `POST /v1/auth/reset-password` (público). */
export const useResetPassword = () => useMutation({ mutationFn: resetPassword });

/** `POST /v1/auth/verify-email` (público). */
export const useVerifyEmail = () => useMutation({ mutationFn: verifyEmail });

/** `GET /v1/invitations/{token}` (público). Sin reintentos: un 404 no va a cambiar. */
export function useInvitation(token: string) {
  return useQuery({
    queryKey: ["invitations", token],
    queryFn: ({ signal }) => fetchInvitation(token, signal),
    retry: false,
    staleTime: 0,
  });
}

/**
 * Acepta la invitación. Cuenta nueva: `{ fullName, password }` sin sesión. Cuenta existente: con
 * la sesión de la persona invitada; si aún no la tiene, `credentials` inicia sesión primero con el
 * mismo correo. Después, la sesión es la de la persona invitada con la bodega de la invitación
 * activa: se descarta toda la caché (también `me`) para que nada de la sesión anterior se vea.
 */
export function useAcceptInvitation(token: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (v: { body: AcceptInvitationDto; withSession: boolean; credentials?: LoginDto }) => {
      if (v.credentials) await login(v.credentials);
      return acceptInvitation(token, v.body, v.withSession || Boolean(v.credentials));
    },
    onSuccess: () => {
      clearOrgInactive();
      client.removeQueries();
    },
  });
}

/** Último 403 `ORG_NOT_ACTIVE` recibido (o `null`). */
export function useOrgInactiveFlag() {
  return useSyncExternalStore(subscribeOrgInactive, getOrgInactiveFlag, () => null);
}
