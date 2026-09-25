@AGENTS.md

# drinks-on-chain-erp

S1 · ERP de trazabilidad de las bodegas (`erp.`). Nace de `drinks-on-chain-app-template` (remoto `template`; se traen mejoras con `git fetch template && git merge template/dev`). Lee el `CLAUDE.md` de la carpeta paraguas, `docs/03-roadmap-frontend.md` §4, `docs/09-contrato-erp-backend.md` y `docs/design-system/01-erp.html`.

- Trabajo en `dev`, PR `dev → main` por sub-etapa (1A…1G), Conventional Commits; autor `brayan gomez <brayankgr@gmail.com>`.
- Antes de un PR: `pnpm lint && pnpm typecheck && pnpm test && pnpm build` y `pnpm e2e`.
- Datos: solo por los hooks de `src/lib/erp/hooks.ts` (sobre `src/lib/erp/resources.ts`, un acceso por endpoint del OpenAPI). Las pantallas nunca llaman a `fetch` ni escriben URLs del backend.
- El backend no tiene entidad "Lote": la vista `LotView` se deriva con `useLotViews()` (`deriveLotViews` de `@drinks-on-chain/mocks`).
- "Hoy" siempre con `today()` de `src/lib/erp/today.ts` (con mocks es 2026-09-25, la fecha de los fixtures).
- Permisos con `can(user, acción)` de `src/lib/erp/permissions.ts` (09 §3): ocultar o desactivar lo que el rol no puede hacer. PLATFORM_ADMIN entra en solo lectura.
- Estados y textos de enumeraciones en `src/lib/erp/labels.ts`; cifras y fechas con `src/lib/format.ts` (es-BO, fechas en UTC).
- Cada página fija sus migas y su única acción principal con `<PageChrome breadcrumbs actions />`.
- Código por módulo en `src/features/<módulo>/` (componentes, cálculos puros con pruebas) y rutas en `src/app/(app)/<módulo>/`.
- Reglas de 01-erp §11: una acción principal en oro arriba a la derecha; etiquetas encima, ayuda debajo, unidades como sufijo; candados en ámbar con motivo y fecha; confirmación explícita antes de decisiones irreversibles; nada de rojo fuera de rechazar/eliminar/alertas; objetivos táctiles de 56 px en pesaje, análisis y bitácora.
- Toda pantalla: cargando (skeleton), vacío (EmptyState con acción), error (ErrorState con reintento). Solo español.
- Puerto local 3002 (`pnpm dev:mocks`). Usuarios de demo en `/__mocks` (contraseña `demo1234`).
