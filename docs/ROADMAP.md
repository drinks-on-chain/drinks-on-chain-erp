# Roadmap del ERP (Etapa 1)

Detalle de `docs/03-roadmap-frontend.md` §4. Se marca con fecha cuando la sub-etapa cumple lo previsto y está en `dev`.

## 1A · Acceso y panel

- [x] Proyecto desde la plantilla (puerto 3002, capa de datos de las 45 operaciones, permisos por rol) · 2026-09-25
- [x] Login dividido y recuperación de acceso (informativa: el backend no tiene endpoint) · 2026-09-25 (recuperación real en la Ola 1)
- [x] AppShell con módulos, bodega activa, usuario y control de acceso por rol · 2026-09-25
- [x] Panel: cifras, tareas pendientes derivadas y candados activos · 2026-09-25
- [x] Perfil (`GET/PATCH /v1/users/me`) · 2026-09-25
- [x] Ajustes de la bodega y miembros (`/v1/wineries/my`, `/members`, alta con `/members/create`) · 2026-09-25 (el equipo pasa a `/equipo` con invitaciones en la Ola 1)
- [x] Selector de organización en la cabecera con varias membresías (`POST /v1/auth/switch-organization`), probado con mocks 0.2 (`sofia@aramayo.test`) · 2026-09-27. Contra el backend real (Sofía, Casa Uriondo suspendida ↔ Altos, con recarga) · 2026-09-27

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
- [x] Integración temprana contra el backend real: `e2e/backend-real.spec.ts` (manual, `E2E_REAL_API=1`, job `workflow_dispatch`) con las personas de la semilla · 2026-09-27
- [x] Recorrido real en verde sin parches (backend `b9e8b68`: decimales como número, `null` en opcionales como omitido, DAG declarado en el OpenAPI): las 6 pruebas, incluido el 429 · 2026-09-27

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
- [x] Integración real (O0-ERP-2): login y cookie `doc_rt` por la reescritura, recarga, cambio de organización, cierre que revoca, permisos de operario, 422 con `details[].field`, 429 con `Retry-After`, alta de parcela `E2E-…` · 2026-09-27
  - Corregido en el ERP: listas validadas como `ContractError` y sin reintentos ante un contrato roto (antes, 3 peticiones y ~4,5 s por pantalla); grafo de trazabilidad del backend normalizado (`src/lib/erp/dag.ts`); las altas no envían `null` en campos opcionales no anulables (`omitNulls`); el operario no pide parcelas (403); certificados del listado de envasado solo de la página visible
  - Backend corregido en `b9e8b68` (decimales como número): el recorrido pasa sin parches; pantallas en 0,2–0,8 s navegando dentro de la app. La línea de tiempo toma el certificado de `details.labAnalysis` del embotellado

## Ola 1 · Cuenta, organización y equipo (O1-ERP-1, sub-etapa 1I)

Contrato: `plan/contratos/o1-backoffice-y-bodegas.md` del plan maestro (§1, §2, §4–§7, §11 bis, §12).

- [x] `@drinks-on-chain/ui` 0.3.0-rc.1 y `@drinks-on-chain/mocks` 0.3.0-rc.2: estado de bodega `INVITED | ACTIVE | SUSPENDED | REVOKED`; `StatusBadge`, `ConfirmDialog`, `DataTable` (paginación y error), `FilterBar` y `DateRangePicker` · 2026-09-27
- [x] Permisos por la membresía activa con la matriz del backend (operario, contabilidad, agronomía, dirección) y navegación por permiso de lectura · 2026-09-27
- [x] `X-Client-App: ERP` en todas las peticiones (plantilla `ba303d4`) y refresco de la misma sesión en `switch-organization` y espera de `Retry-After` en los 429 (plantilla `da38404`) · 2026-09-27
- [x] Aceptar invitación `/invitacion/[token]`: cuenta nueva o existente, caducada, no encontrada, correo distinto; entra con la bodega invitada activa · 2026-09-27
- [x] Recuperar contraseña con `captchaToken` (Turnstile tras `NEXT_PUBLIC_TURNSTILE_SITE_KEY`) y `/restablecer/[token]`; verificación de correo · 2026-09-27
- [x] Perfil: cambiar contraseña y preferencias (idioma, avisos del lote, promociones); `PATCH /users/me` en las dos formas · 2026-09-27
- [x] Equipo: miembros con estado y quién bloqueó, invitaciones pendientes con caducidad, invitar, reenviar, anular, cambiar rol, bloquear y desbloquear · 2026-09-27
- [x] Configuración efectiva (lectura) en Ajustes y bitácora propia de la dirección con filtros y paginación · 2026-09-27
- [x] Pantalla de bodega no activa (`ORG_NOT_ACTIVE`: invitada, suspendida, revocada) sin romper la navegación · 2026-09-27
- [x] Pruebas: unitarias de reglas de equipo, contraseñas, estado de la organización, configuración, bitácora y cuenta; e2e con el buzón simulado (invitación nueva y existente, recuperación), equipo, bodega no activa, axe y teclado · 2026-09-27
- [ ] Contra el backend real cuando publique O1-BE-1 (todo el §6 de los mocks está pendiente del backend)
- [x] IP real del cliente detrás del proxy (O1-OPS-1): `rewrites` sustituidos por `src/proxy.ts`, que reescribe `/api/v1/*` a `${API_ORIGIN}/v1/*` con `X-DOC-Client-IP` firmada (HMAC con `PROXY_SHARED_SECRET`, variable de servidor) · 2026-09-27
