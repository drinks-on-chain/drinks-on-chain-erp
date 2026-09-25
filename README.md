# drinks-on-chain-app-template

Plantilla de aplicación del ecosistema **Drinks on Chain** (Etapa 0.3 del roadmap). De ella nacen el ERP, el Marketplace, el POS y el Backoffice. Planificación en [drinks-on-chain-docsfront](https://github.com/BrianKGR01/drinks-on-chain-docsfront).

## Qué trae

| Pieza                                                                                                                                  | Dónde                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Next.js 16 (App Router, Turbopack), React 19, TypeScript estricto, Tailwind 4                                                          | —                                                     |
| Sistema de diseño `@drinks-on-chain/ui` (tokens, componentes, shells)                                                                  | `src/app/globals.css`, `src/components/app-frame.tsx` |
| Datos de prueba `@drinks-on-chain/mocks` con MSW en el navegador                                                                       | `src/app/providers.tsx` (`MocksGate`)                 |
| Cliente de API tipado: envoltorio `{ success, data \| error }`, Bearer, renovación ante 401, errores tipados, listas en las dos formas | `src/lib/api/`                                        |
| Sesión en el navegador (memoria + `sessionStorage`) y hooks de autenticación                                                           | `src/lib/api/session.ts`, `src/lib/auth/`             |
| TanStack Query con reintentos solo en red y 5xx                                                                                        | `src/lib/query-client.ts`                             |
| Diccionario en español                                                                                                                 | `src/lib/i18n/es.ts`                                  |
| Login, zona privada con AppShell y página de ejemplo con estados cargando / error                                                      | `src/app/(auth)`, `src/app/(app)`                     |
| Panel `/__mocks`: escenario, restablecer datos, entrar como cualquier usuario de demo                                                  | `src/app/%5F%5Fmocks`                                 |
| Vitest + Testing Library, Playwright (escritorio y tablet), ESLint, Prettier                                                           | `vitest.config.mts`, `playwright.config.ts`           |
| CI: lint, tipos, pruebas, build y E2E                                                                                                  | `.github/workflows/ci.yml`                            |

## Empezar

Requisitos: Node 22 (`.nvmrc`) y pnpm 10 (`corepack enable`).

```bash
pnpm install
cp .env.example .env.local
pnpm dev:mocks        # http://localhost:3009 con datos de prueba
```

Usuarios de demo en `/__mocks` (contraseña `demo1234`), p. ej. `enologa@cintiviejo.test`.

| Script                                     | Qué hace                                                                              |
| ------------------------------------------ | ------------------------------------------------------------------------------------- |
| `pnpm dev` / `pnpm dev:mocks`              | Servidor de desarrollo sin / con MSW                                                  |
| `pnpm lint`, `pnpm typecheck`, `pnpm test` | Calidad (el typecheck genera antes los tipos de rutas de Next)                        |
| `pnpm e2e`                                 | Playwright contra un build de producción con mocks (en local usa el Chrome instalado) |
| `pnpm format`                              | Prettier                                                                              |

## Variables de entorno

| Variable                                                                    | Uso                                                                                                          |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_API_URL`                                                       | Base del backend. Vacía = mismo origen (con mocks basta). Desarrollo real: `https://136.243.223.39.sslip.io` |
| `NEXT_PUBLIC_MOCKS`                                                         | `1` arranca MSW; también habilita `/__mocks` en producción (demos)                                           |
| `NEXT_PUBLIC_URL_LANDING`, `NEXT_PUBLIC_URL_BODEGAS`, `NEXT_PUBLIC_URL_APP` | Enlaces a los otros sitios; nunca se escriben hosts en componentes                                           |

Cambiar de mocks a backend real: `NEXT_PUBLIC_MOCKS=0` y `NEXT_PUBLIC_API_URL` al servidor. Las pantallas no cambian.

## Crear una app nueva desde la plantilla

1. `gh repo create drinks-on-chain/drinks-on-chain-<sistema> --public --template drinks-on-chain/drinks-on-chain-app-template --clone`.
2. En `package.json`: `name` y el puerto de `dev`, `dev:mocks` y `start` (ERP 3002; ver el `CLAUDE.md` de la carpeta paraguas).
3. Metadatos en `src/app/layout.tsx`, tema (`data-theme="cava"` en el POS) y navegación en `src/components/app-frame.tsx` (o el shell que toque: `AdminShell`, `StoreShell`, `KioskShell`).
4. Crear la rama `dev`, conectar el repo en Vercel (producción desde `main`, previews desde `dev`) con `NEXT_PUBLIC_MOCKS=1` mientras no haya backend.

## Convenciones

Trabajo en `dev`, PR `dev → main` por hito, Conventional Commits. Detalle en `CLAUDE.md`.

## Actualizar los paquetes compartidos

`@drinks-on-chain/ui` y `@drinks-on-chain/mocks` se instalan desde el tarball de su GitHub Release:

```bash
pnpm add https://github.com/drinks-on-chain/drinks-on-chain-design-system/releases/download/vX.Y.Z/drinks-on-chain-ui-X.Y.Z.tgz
pnpm add https://github.com/drinks-on-chain/drinks-on-chain-mocks/releases/download/vX.Y.Z/drinks-on-chain-mocks-X.Y.Z.tgz
pnpm exec msw init public --save   # si cambió msw
```
