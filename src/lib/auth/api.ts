import { AuthResponseSchema, UserProfileResponseSchema, type LoginDto } from "@drinks-on-chain/mocks";
import { api } from "@/lib/api/client";
import { clearTokens, setTokens } from "@/lib/api/session";

export async function login(credentials: LoginDto) {
  const res = await api("/v1/auth/login", {
    method: "POST",
    body: credentials,
    schema: AuthResponseSchema,
    auth: false,
  });
  setTokens(res.tokens);
  return res.user;
}

export function logout() {
  clearTokens();
}

export function fetchMe(signal?: AbortSignal) {
  return api("/v1/users/me", { schema: UserProfileResponseSchema, signal });
}
