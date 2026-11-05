@AGENTS.md

# drinks-on-chain-erp

S1 · ERP de trazabilidad de las bodegas (`erp.`). Nace de `drinks-on-chain-app-template` (remoto `template`; se traen mejoras con `git fetch template && git merge template/dev`). Lee el `CLAUDE.md` de la carpeta paraguas, `docs/03-roadmap-frontend.md` §4, `docs/09-contrato-erp-backend.md` y `docs/design-system/01-erp.html`.

- Trabajo en `dev`, PR `dev → main` por sub-etapa (1A…1G), Conventional Commits; autor `brayan gomez <brayankgr@gmail.com>`.
- Antes de un PR: `pnpm lint && pnpm typecheck && pnpm test && pnpm build` y `pnpm e2e`.
- Datos: solo por los hooks de `src/lib/erp/hooks.ts` (sobre `src/lib/erp/resources.ts`, un acceso por endpoint del OpenAPI). Las pantallas nunca llaman a `fetch` ni escriben URLs del backend.
- **El lote es una entidad del servidor** (Ola 2, contrato `plan/contratos/o2-erp-confiable.md`): lista, ficha, candados, balance, conformidad, expediente y línea de tiempo vienen de `GET /v1/lots…`; nada se deriva en el cliente (`LotView` y `deriveLotViews` se retiraron). Las **reglas de negocio no se reimplementan aquí**: la UI muestra lo que el servidor calcula (vista previa del embotellado, D.O., candados) y explica sus 409/422 con `RuleViolationNotice` (`src/lib/erp/rule-violations.ts`, un texto por cada `TRC_…`).
- Registros anulados (`voided`, `voidedAt`): se muestran tachados con su marca y fuera de los cálculos de la UI (`src/lib/erp/voided.ts`). Las correcciones nunca editan ni borran: diálogo con motivo.
- Prueba contra el backend real: `e2e/backend-real.spec.ts` con `E2E_REAL_API=1` (workflow manual «E2E contra el backend real»); deja un lote cerrado por ejecución en la bodega de demostración, así que se lanza solo cuando hace falta.
- **Cadena y tokenización** (Ola 3, contrato `plan/contratos/o3-tokenizacion.md`): el ERP solo lee la red a través del backend (`ChainTxRef` incrustados); nunca guarda claves ni firma. Los enlaces al explorador son siempre el `explorerUrl` que devuelve el backend (`ExplorerLink`, `ChainAddress`, `TxStatusBadge` de `@drinks-on-chain/ui`): ningún host del explorador en el código. Estados y «en curso» en `src/lib/erp/chain.ts`; las consultas con transacciones se repiten cada 5 s solo mientras alguna sigue en vuelo. La tokenización (1K, `src/features/tokenizacion/`) va detrás de `env.tokenization` (`NEXT_PUBLIC_ERP_TOKENIZATION`) hasta el cierre de la ola; la cuota y sus límites los decide el servidor y los `TOK_…` se explican con `RuleViolationNotice`.
- "Hoy" siempre con `today()` de `src/lib/erp/today.ts` (con mocks es 2026-09-25, la fecha de los fixtures).
- Permisos con `can(me, acción)` de `src/lib/erp/permissions.ts` (09 §3): salen de la membresía de la **organización activa** (`erpRole(me)`), no del rol global; ocultar o desactivar lo que el rol no puede hacer. La plataforma entra en solo lectura.
- Sesión (contrato de la Ola 0, heredada de la plantilla): acceso solo en memoria, renovación con la cookie `doc_rt`; nunca guardar tokens en `sessionStorage`/`localStorage`. La API se llama en `/api/v1/*` del propio origen (`src/proxy.ts` la reescribe a `API_ORIGIN` con la IP del cliente firmada con `PROXY_SHARED_SECRET`). `useMe()` devuelve `{ user, memberships, activeOrganizationId }`.
- Listas con `limit` ≤ 100: las colecciones que se cargan enteras pasan por `fetchAllPages()`. Errores de formulario con `fieldErrorsFrom()` (`details[].field`).
- Estados y textos de enumeraciones en `src/lib/erp/labels.ts`; cifras y fechas con `src/lib/format.ts` de la plantilla (único `parseDecimal`, es-BO, fechas en UTC).
- Cada página fija sus migas y su única acción principal con `<PageChrome breadcrumbs actions />`.
- Código por módulo en `src/features/<módulo>/` (componentes, cálculos puros con pruebas) y rutas en `src/app/(app)/<módulo>/`.
- Reglas de 01-erp §11: una acción principal en oro arriba a la derecha; etiquetas encima, ayuda debajo, unidades como sufijo; candados en ámbar con motivo y fecha; confirmación explícita antes de decisiones irreversibles; nada de rojo fuera de rechazar/eliminar/alertas; objetivos táctiles de 56 px en pesaje, análisis y bitácora.
- Toda pantalla: cargando (skeleton), vacío (EmptyState con acción), error (ErrorState con reintento). Solo español.
- Capturas de revisión visual en `capturas/` (ignorada por git). Puerto local 3002 (`pnpm dev:mocks`). Usuarios de demo en `/__mocks` (contraseña `demo1234`).
