import { z } from "zod";

// Variables públicas. Next las inyecta en tiempo de build, así que cada una se lee
// por su nombre literal (no con process.env[clave]).
const schema = z.object({
  mocks: z.boolean(),
  urlLanding: z.string().url().or(z.literal("")),
  urlBodegas: z.string().url().or(z.literal("")),
  urlApp: z.string().url().or(z.literal("")),
  turnstileSiteKey: z.string(),
  tokenization: z.boolean(),
});

/**
 * Bandera de la tokenización (1K, contrato de la Ola 3 §12.1): `NEXT_PUBLIC_ERP_TOKENIZATION=1` la
 * activa y `=0` la apaga; sin definir, queda activa solo con mocks. Se retira al cierre de la ola.
 */
export function tokenizationEnabled(vars: { flag: string | undefined; mocks: boolean }): boolean {
  const flag = vars.flag?.trim();
  if (flag === "1") return true;
  if (flag === "0") return false;
  return vars.mocks;
}

export const env = schema.parse({
  mocks: process.env.NEXT_PUBLIC_MOCKS === "1",
  urlLanding: process.env.NEXT_PUBLIC_URL_LANDING ?? "",
  urlBodegas: process.env.NEXT_PUBLIC_URL_BODEGAS ?? "",
  urlApp: process.env.NEXT_PUBLIC_URL_APP ?? "",
  turnstileSiteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? "",
  tokenization: tokenizationEnabled({
    flag: process.env.NEXT_PUBLIC_ERP_TOKENIZATION,
    mocks: process.env.NEXT_PUBLIC_MOCKS === "1",
  }),
});

/** Clave de prueba pública de Cloudflare Turnstile: siempre valida (widget visible). */
export const TURNSTILE_TEST_SITE_KEY = "1x00000000000000000000AA";

/** Token de captcha para los mocks: cualquier valor no vacío vale (salvo si contiene `fail`). */
export const MOCK_CAPTCHA_TOKEN = "mocks-captcha-ok";

export type CaptchaMode = { kind: "mock" } | { kind: "turnstile"; siteKey: string } | { kind: "missing" };

/**
 * Captcha de los formularios públicos (contrato de la Ola 1 §0): Turnstile con
 * `NEXT_PUBLIC_TURNSTILE_SITE_KEY`; sin clave, con mocks se envía un valor de prueba y en
 * desarrollo se usa la clave de prueba de Cloudflare. En producción sin clave no hay captcha.
 */
export function captchaMode(
  vars: { siteKey: string; mocks: boolean; production: boolean } = {
    siteKey: env.turnstileSiteKey,
    mocks: env.mocks,
    production: process.env.NODE_ENV === "production",
  },
): CaptchaMode {
  if (vars.siteKey) return { kind: "turnstile", siteKey: vars.siteKey };
  if (vars.mocks) return { kind: "mock" };
  if (!vars.production) return { kind: "turnstile", siteKey: TURNSTILE_TEST_SITE_KEY };
  return { kind: "missing" };
}

/** Las herramientas de desarrollo (/__mocks) existen en local y en demos con mocks. */
export const devToolsEnabled = process.env.NODE_ENV !== "production" || env.mocks;

/**
 * Prefijo de la API en el origen de la propia app (P-1, contrato de la Ola 0 §7). El cliente
 * llama a `/api/v1/*`; `src/proxy.ts` lo reescribe a `${API_ORIGIN}/v1/*` y la cookie de
 * renovación queda de primera parte. Con mocks, MSW intercepta `/api/v1/*` en el navegador.
 */
export const API_BASE = "/api";

const apiOriginSchema = z
  .string()
  .trim()
  .url("API_ORIGIN debe ser una URL, p. ej. https://api.ejemplo.bo")
  .refine((v) => /^https?:\/\//i.test(v), "API_ORIGIN debe empezar por http:// o https://")
  // Se toleran la barra final y un `/v1` final.
  .transform((v) => v.replace(/\/+$/, "").replace(/\/v1$/i, ""));

type ServerVars = { API_ORIGIN?: string; NEXT_PUBLIC_MOCKS?: string };

/**
 * Origen del backend para la reescritura de `src/proxy.ts` (variable de servidor
 * `API_ORIGIN`, nunca pública; `next.config.ts` la valida también al construir). Obligatoria salvo con `NEXT_PUBLIC_MOCKS=1`, donde no hay
 * reescritura y devuelve `null`. Solo se evalúa en el servidor (build y `next start`).
 */
export function resolveApiOrigin(
  vars: ServerVars = { API_ORIGIN: process.env.API_ORIGIN, NEXT_PUBLIC_MOCKS: process.env.NEXT_PUBLIC_MOCKS },
): string | null {
  const raw = vars.API_ORIGIN?.trim();
  if (!raw) {
    if (vars.NEXT_PUBLIC_MOCKS === "1") return null;
    throw new Error(
      "Falta API_ORIGIN (origen del backend, p. ej. https://136.243.223.39.sslip.io). " +
        "Defínela o arranca con NEXT_PUBLIC_MOCKS=1 para usar los datos de prueba.",
    );
  }
  const parsed = apiOriginSchema.safeParse(raw);
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  return parsed.data;
}
