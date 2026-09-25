import { z } from "zod";

// Variables públicas. Next las inyecta en tiempo de build, así que cada una se lee
// por su nombre literal (no con process.env[clave]).
const schema = z.object({
  apiUrl: z.string().url().or(z.literal("")),
  mocks: z.boolean(),
  urlLanding: z.string().url().or(z.literal("")),
  urlBodegas: z.string().url().or(z.literal("")),
  urlApp: z.string().url().or(z.literal("")),
});

export const env = schema.parse({
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? "",
  mocks: process.env.NEXT_PUBLIC_MOCKS === "1",
  urlLanding: process.env.NEXT_PUBLIC_URL_LANDING ?? "",
  urlBodegas: process.env.NEXT_PUBLIC_URL_BODEGAS ?? "",
  urlApp: process.env.NEXT_PUBLIC_URL_APP ?? "",
});

/** Las herramientas de desarrollo (/__mocks) existen en local y en demos con mocks. */
export const devToolsEnabled = process.env.NODE_ENV !== "production" || env.mocks;
