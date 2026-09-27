# drinks-on-chain-erp

**S1 · ERP de trazabilidad** de Drinks on Chain (`erp.`): las bodegas registran el recorrido de cada lote, de la parcela a la botella (terroir → vendimia → tanque → crianza o destilación → embotellado y QR). Etapa 1 del roadmap (`docs/03-roadmap-frontend.md` §4). Contrato con el backend en `docs/09-contrato-erp-backend.md`.

Nace de [drinks-on-chain-app-template](https://github.com/drinks-on-chain/drinks-on-chain-app-template): stack, scripts, variables y pruebas se documentan allí.

## Empezar

```bash
pnpm install
cp .env.example .env.local
pnpm dev:mocks        # http://localhost:3002 con datos de prueba
```

Entra con `enologa@cintiviejo.test` / `demo1234` o elige usuario en `/__mocks`.

## Variables de entorno

| Variable                                                                    | Uso                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_MOCKS`                                                         | `1` arranca MSW en el navegador (intercepta `/api/v1/*` con `@drinks-on-chain/mocks`) y habilita `/__mocks` en producción. Es lo que usa hoy Vercel                                                                                                                                                                |
| `API_ORIGIN`                                                                | **Solo servidor.** Origen del backend: Next reescribe `/api/v1/*` a `${API_ORIGIN}/v1/*` (P-1, contrato de la Ola 0 §7), así la cookie de renovación `doc_rt` es de primera parte. Obligatoria sin mocks y **al construir** (las reescrituras se fijan en el build). Desarrollo: `https://136.243.223.39.sslip.io` |
| `NEXT_PUBLIC_URL_LANDING`, `NEXT_PUBLIC_URL_BODEGAS`, `NEXT_PUBLIC_URL_APP` | Enlaces a los otros sitios                                                                                                                                                                                                                                                                                         |

Contra el backend de desarrollo: `NEXT_PUBLIC_MOCKS=0` y `API_ORIGIN=https://136.243.223.39.sslip.io`. `NEXT_PUBLIC_API_URL` ya no existe: el navegador nunca llama al backend directamente.

La sesión, la organización activa, las listas y los errores por campo siguen el contrato de la Ola 0 y los trae la plantilla (su README explica la renovación silenciosa y la tolerancia transitoria hasta H1). Con varias membresías, el selector de la cabecera cambia la organización activa (prueba con `sofia@aramayo.test`); los permisos del ERP salen de la membresía activa.

## Prueba contra el backend real

Excluida por defecto (no corre en CI ni con `pnpm e2e`). **No puede pasar entera hasta que el backend implemente el contrato de la Ola 0 (O0-BE-4)**: login con cookie `doc_rt`, `refresh` sin cuerpo, `GET /users/me` con membresías y listas paginadas. Para lanzarla:

```bash
E2E_REAL_API=https://136.243.223.39.sslip.io E2E_PORT=3150 pnpm e2e --project=escritorio
```

Con `E2E_REAL_EMAIL` y `E2E_REAL_PASSWORD` (usuario de bodega del backend) prueba también el login y el directorio de terroirs.

Publicado en Vercel (con datos de prueba): https://drinks-on-chain-erp.vercel.app · panel de usuarios de demo en `/__mocks`.

## Estructura

| Carpeta                      | Qué hay                                                                                                  |
| ---------------------------- | -------------------------------------------------------------------------------------------------------- |
| `src/app/(auth)`             | Login dividido y recuperación de acceso                                                                  |
| `src/app/(app)`              | Panel y módulos (origen, vendimia, vinificación, crianza, destilación, envasado, lotes, cuenta, ajustes) |
| `src/lib/erp/resources.ts`   | Un acceso por endpoint del backend, validado con los esquemas zod de `@drinks-on-chain/mocks`            |
| `src/lib/erp/hooks.ts`       | Hooks de lectura y escritura (TanStack Query) y `useLotViews()`                                          |
| `src/lib/erp/permissions.ts` | Qué puede hacer cada rol                                                                                 |
| `src/features/<módulo>`      | Componentes y cálculos de cada módulo                                                                    |

Avance en [`docs/ROADMAP.md`](docs/ROADMAP.md).
