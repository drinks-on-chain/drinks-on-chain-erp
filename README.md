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

Contra el backend de desarrollo: `NEXT_PUBLIC_MOCKS=0` y `NEXT_PUBLIC_API_URL=https://136.243.223.39.sslip.io`.

Prueba de integración contra el backend real (no corre en CI):

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
