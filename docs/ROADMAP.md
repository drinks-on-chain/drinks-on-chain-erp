# Roadmap del ERP (Etapa 1)

Detalle de `docs/03-roadmap-frontend.md` §4. Se marca con fecha cuando la sub-etapa cumple lo previsto y está en `dev`.

## 1A · Acceso y panel

- [x] Proyecto desde la plantilla (puerto 3002, capa de datos de las 45 operaciones, permisos por rol) · 2026-09-25
- [x] Login dividido y recuperación de acceso (informativa: el backend no tiene endpoint) · 2026-09-25
- [x] AppShell con módulos, bodega activa, usuario y control de acceso por rol · 2026-09-25
- [x] Panel: cifras, tareas pendientes derivadas y candados activos · 2026-09-25
- [x] Perfil (`GET/PATCH /v1/users/me`) · 2026-09-25
- [x] Ajustes de la bodega y miembros (`/v1/wineries/my`, `/members`, alta con `/members/create`) · 2026-09-25
- [x] Selector de organización en la cabecera con varias membresías (`POST /v1/auth/switch-organization`), probado con mocks 0.2 (`sofia@aramayo.test`) · 2026-09-27. Contra el backend real, pendiente de O0-BE-4

## 1B · Origen

- [x] Directorio de terroirs con búsqueda, pills por cepa y DoBadge · 2026-09-25
- [x] Ficha, alta y edición de terroir (certificado D.O. vía uploads) · 2026-09-25

## 1C · Vendimia y vinificación

- [x] Pesaje con BigNumberInput (Brix, pH y acidez obligatorios) · 2026-09-25
- [x] Análisis y dictamen fitosanitario · 2026-09-25
- [x] TankGrid, bitácora, tratamientos y decisión de destino al crear el tanque · 2026-09-25

## 1D · Crianza y destilación

- [x] Barricas con CountdownLock · 2026-09-25
- [x] Cortes del alambique y candado de reposo de 180 días · 2026-09-25

## 1E · Envasado y QR

- [x] Embotellado con conciliación y bloqueo por candado (422) · 2026-09-25
- [x] Éxito con sello, certificado de laboratorio y exportación de QR · 2026-09-25
- [x] Lotes: listado con filtros y línea de tiempo del lote (vista derivada `LotView`) · 2026-09-25
- [ ] Códigos QR individuales por botella: hoy son provisionales (el backend emite uno por lote, 09 §8 punto 10)

## 1F · Cuenta de la bodega

- [x] Panel de solo lectura de la cuenta Stellar · 2026-09-25
- [ ] Activos por lote (emitidas, en circulación, quemadas): pendiente de que el backend los exponga

## 1G · Calidad

- [x] Estados en todas las pantallas, teclado, lector de pantalla · 2026-09-25
- [x] Playwright del flujo "Singani Gran Reserva 2026" de origen a QR (lote nuevo hasta el reposo + embotellado de un reposo cumplido y exportación de QR) · 2026-09-25
- [ ] Integración temprana: login y origen contra el backend real. Preparado: `E2E_REAL_API=… pnpm e2e` (`e2e/backend-real.spec.ts`); verificado el 2026-09-25 que el backend responde el 401 con el envoltorio esperado y que el CORS admite `localhost:3002` y `drinks-on-chain-erp.vercel.app`. Falta un usuario de bodega con datos en el servidor (10 §2.1)

## Ola 0 · Sesiones y estándares (O0-ERP-1)

Contrato: `plan/contratos/o0-sesiones-y-estandares.md` del plan maestro. La base llega con `git merge template/dev`.

- [x] `@drinks-on-chain/ui` 0.2.0 y `@drinks-on-chain/mocks` 0.2.0-rc.1 · 2026-09-27
- [x] Cliente de la plantilla: `/api/v1/*` del propio origen con reescritura a `API_ORIGIN`, acceso solo en memoria, renovación con cookie y recuperación al recargar, una sola renovación en vuelo, cierre con aviso ante `AUTH_REFRESH_REUSED`/`AUTH_SESSION_REVOKED`, `logout` contra el endpoint · 2026-09-27
- [x] `GET /users/me` con `MeResponseSchema`; permisos por la membresía de la organización activa (`erpRole`) · 2026-09-27
- [x] Selector de organización en la cabecera; al cambiar se vacía la caché y se vuelve al panel · 2026-09-27
- [x] Listas con `limit` ≤ 100: fuera `ALL=500`; las colecciones completas recorren páginas de 100 (`fetchAllPages`) · 2026-09-27
- [x] Un único `parseDecimal` (`src/lib/format.ts` de la plantilla): fuera las reexportaciones de `form-utils` y `bottling-form-model` · 2026-09-27
- [x] `details[].field` marca el campo exacto en login, origen, pesaje, tanque, bitácora, tratamiento, crianza, destilación, ajustes y perfil (`fieldErrorsFrom`) · 2026-09-27
- [x] Login con `BrandSeal` (`feat/login-marca`, necesita `ui` 0.2.0) · 2026-09-27
- [x] Pruebas unitarias y todas las E2E con mocks en verde (humo con recarga, cambio de organización, cierre de sesión y error por campo) · 2026-09-27
- [ ] Integración real: login, cambio de organización y parcelas contra el backend de desarrollo (`e2e/backend-real.spec.ts`, excluida por defecto) — pendiente de O0-BE-4 (O0-ERP-2)
