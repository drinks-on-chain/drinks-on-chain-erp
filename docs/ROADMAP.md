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
- [x] Contra el backend real (O1-ERP-2, backend `eace713`): invitación con cuenta nueva desde Mailpit, preferencias, cambio y recuperación de contraseña, rol, bloqueo con la sesión revocada (401) y desbloqueo, reenviar y anular, configuración efectiva, bitácora con filtros, bodega suspendida (solo estado, perfil y bitácora), operario que lee parcelas y pesa, invitación aceptada con cuenta existente (acceso + refresco); `backend-real` 7/7 sin parches · 2026-09-27
  - Corregido en el ERP: el operario lee parcelas (§11 bis); códigos de acción de la bitácora de trazabilidad con los del backend (`FERMENTATION_LOG_ADDED`, `BOTTLING_BATCH_CREATED`…)
- [x] `@drinks-on-chain/mocks` 0.4.0-rc.1 (contrato estricto del backend): grafo `DagGraphResponseDto` sin la forma antigua, altas sin `null` en opcionales, archivos por `key` con URL firmada al mostrarlos (`GET /v1/uploads/url`) · 2026-09-27
- [x] IP real del cliente detrás del proxy (O1-OPS-1): `rewrites` sustituidos por `src/proxy.ts`, que reescribe `/api/v1/*` a `${API_ORIGIN}/v1/*` con `X-DOC-Client-IP` firmada (HMAC con `PROXY_SHARED_SECRET`, variable de servidor) · 2026-09-27

## Cierre de la Ola 1 (H1) · retirada de la compatibilidad transitoria

Contrato: `plan/contratos/o1-backoffice-y-bodegas.md` §11 y `o0-sesiones-y-estandares.md` §5. Llega con la plantilla (`git merge template/dev`).

- [x] Sin `refreshToken` en el cuerpo: ni se guarda ni se reenvía en `refresh` ni en `switch-organization` (aceptar una invitación ya no lo enviaba); el de la respuesta se ignora · 2026-09-27
- [x] Esquemas de sesión, login con segundo factor y `me` sin `tokens.refreshToken` ni `user.userRole/wineryId/memberRole` (`src/lib/auth/schemas.ts` de la plantilla); ninguna pantalla los lee · 2026-09-27
- [x] `PATCH /v1/users/me` solo con `{ user, memberships, activeOrganizationId }` (fuera `meFromUpdate` y la relectura); `details` solo como `{ field, message }` · 2026-09-27
- [x] Aviso "Tu sesión se cerró por seguridad" en el login también al recargar con una sesión revocada (E2E de humo) · 2026-09-27
- [x] Enlace "Perfil" del menú de usuario con `linkComponent`: el fallo estaba en `@drinks-on-chain/ui` (`SidebarShell` no pasaba `linkComponent` al `Menu` del bloque de usuario); corregido en `@drinks-on-chain/ui` 0.3.1-rc.1, que llega con la plantilla, y cubierto por el e2e de humo (navega sin recargar) · 2026-09-27
- [x] `@drinks-on-chain/mocks` 0.4.0-rc.2 (retirada de H1 en los mocks) con la plantilla: esquemas de sesión y `me` reexportados salvo `tokens.refreshToken` (obsoleto hasta 0.5), panel `/__mocks` con `DemoUser.role` y pruebas sin campos de 0.1 · 2026-09-27

## Ola 2 · O2-ERP-1 (sub-etapa 1J) · ERP confiable sobre el lote del servidor

Contrato: `plan/contratos/o2-erp-confiable.md` del plan maestro (§2–§14, §16.3, §17 fila «ERP», §18) y `docs/CONTRATO.md` §10 de los mocks 0.5 (donde difieren, manda el OpenAPI). Se construye y se prueba contra mocks: el backend responde 501 en buena parte de las rutas nuevas. Sin bandera `NEXT_PUBLIC_ERP_LOTS_V2`: `dev` trabaja con el lote nuevo; producción sigue en `main` hasta el cierre de la ola.

### Fase 1 · Base y lote

- [x] `@drinks-on-chain/mocks` 0.5.0-rc.1 y escenarios de datos en `/__mocks` (`lote-en-reposo`, `lote-listo`, `lote-con-incidencia`, `laboratorio-no-conforme`) · 2026-10-02
- [x] Cliente: `Idempotency-Key` (pesajes, lecturas, embotellado y cierre del expediente; la clave se repite solo si el envío quedó sin respuesta), `apiFile()` para CSV y JSON canónico, lectura de los `details` ampliados (`code`, `rule`, `expected`, `actual`, `meta`) · 2026-10-02
- [x] `src/lib/erp`: un acceso por operación de `/v1/lots*` y de las acciones nuevas (análisis de madurez, dictámenes, transiciones de tanque, descartes, cierre de destilación, panel, reportes), hooks, etiquetas y permisos del contrato §14 · 2026-10-02
- [x] `RuleViolationNotice` (local, pendiente de mover a `@drinks-on-chain/ui`): explica los 46 códigos `TRC_…` con la regla de la instantánea, lo exigido, lo registrado y qué hacer; sustituye a `FormErrorAlert` en los formularios · 2026-10-02
- [x] Lista de lotes con filtros y paginación del servidor (etapa, tipo, búsqueda, incidencias), etapas de §16.3, candado (`nextLock`), laboratorio, botellas e incidencias · 2026-10-02
- [x] Ficha del lote `/lotes/{lotId}`: candados con motivo y fecha, D.O. calculada, instantánea de reglas, registros del lote (grafo), línea de tiempo e incidencias de migración; los enlaces antiguos `/lotes/{harvestBatchId}` redirigen por `GET /v1/harvest-batches/{id}` → `lotId` · 2026-10-02
- [x] «Nuevo lote» en origen (`/lotes/nuevo`) y desde el pesaje (`newLot`), con las reglas vigentes que se fijarán a la vista; pesaje con lote, lote nuevo o uva sin lote, con el análisis opcional y sin dictamen en el alta · 2026-10-02
- [x] Retirados la lista y la ficha derivadas de `LotView` (`lots.ts`, `LotStatusBadge`); `useLotViews` queda solo para el panel y el embotellado hasta las fases 3 y 4 · 2026-10-02
- [x] Pruebas: unitarias de reglas, lote, idempotencia, descargas y pesaje; e2e `lotes.spec.ts` (lista, ficha, redirección, alta con D.O. rechazada, incidencia de migración, operario) y el resto adaptado a los fixtures de la Ola 2 · 2026-10-02

### Fase 2 · Origen, vendimia y vinificación

- [x] Parcelas: aptitud D.O. calculada por el servidor (`isDoEligible` y `doEvaluation` con las reglas vigentes de la bodega): badge, filtro y ficha con cada comprobación y el mínimo legal; fuera la casilla «apta para D.O.» y la evaluación en el cliente; una parcela con pesajes no cambia altitud, cepa ni materia prima por edición (409 `TRC_TERROIR_IN_USE`, explicado) · 2026-10-02
- [x] Vendimia: pesaje sin análisis y uva sin lote (filtro `lotId=none`, columna «Lote»); ficha del pesaje con la parcela tal como era al pesar, kilos disponibles, registro tardío y D.O. con las reglas del lote · 2026-10-02
- [x] Análisis de madurez aparte (`POST …/maturity-analyses`): historial, vigente y alta en un diálogo; solo inserción · 2026-10-02
- [x] Dictamen fitosanitario (`POST …/phyto-decisions`): historial con autor y rol, motivo obligatorio al rechazar o poner en cuarentena, informe por `key` · 2026-10-02
- [x] Tanques: alta con entradas por pesaje (`inputs` con kilos), lote de la uva, lote existente o «Nuevo lote» desde el tanque (`newLot`), sin destino al llenar; acciones `start`, `complete` (bifurcación con confirmación explícita, volumen final y D.O. comprobada) y `clean`; capacidad, código en uso y dictamen los decide el servidor · 2026-10-02
- [x] Pruebas: unitarias de D.O., análisis, dictámenes y alta/cierre de tanque; e2e de origen, vendimia, vinificación y `elusion.spec.ts` (`TRC_PHYTO_IN_CREATE`, `TRC_PHYTO_NOT_APPROVED`, `TRC_DO_TERROIR_NOT_ELIGIBLE`, `TRC_DO_NOT_ELIGIBLE`, `TRC_DESTINATION_MISMATCH`, `TRC_TANK_CAPACITY_EXCEEDED`, `TRC_TERROIR_IN_USE`); axe en los diálogos nuevos · 2026-10-02

### Fase 3 · Crianza, destilación y embotellado

- [x] Crianza: candado evaluado por el servidor (`lock`: días, fecha de liberación y regla aplicada de la instantánea), número de recipientes, descarte con motivo; el estado del tanque, el volumen disponible y el mínimo de meses los comprueba el servidor (`TRC_VOLUME_EXCEEDS_AVAILABLE`, `TRC_AGING_BELOW_MINIMUM`) · 2026-10-02
- [x] Destilación: se abre con el vino base y se cierra con sus cortes y el grado del corazón (`POST …/close`), con el balance de masa del servidor (`TRC_MASS_BALANCE_EXCEEDED`); el reposo cuenta desde el cierre con los días de la instantánea; descarte con motivo · 2026-10-02
- [x] Embotellado del lote en `/lotes/{id}/embotellar`: fuentes con su candado, vista previa del servidor (`POST …/bottling/preview`) con volumen, merma tolerada y alcohol puro, y registro con `Idempotency-Key` solo cuando la vista previa es válida; `/envasado/nuevo` elige el lote o redirige los enlaces antiguos (`?lote=`, `?crianza=`, `?destilacion=`) · 2026-10-02
- [x] `LotBalanceChart` (local, pendiente de mover a `@drinks-on-chain/ui`): conciliación kilos → litros → botellas con la merma de cada etapa y medidores del embotellado; pestaña «Balance» de la ficha del lote y ficha del embotellado · 2026-10-02
- [x] `BottleCodeExport` (local, pendiente de mover a `@drinks-on-chain/ui`): tabla paginada por el servidor con filtros de estado y rango de series, CSV, ZIP con los QR para la imprenta con seguimiento de la exportación, y anulación con motivo y sustitución; pestaña «Códigos» de la ficha del lote · 2026-10-02
- [x] Retirados el formulario de embotellado por fuente, el cálculo local de rendimiento y merma y la exportación de QR generada en el navegador (`fflate` fuera de las dependencias) · 2026-10-02
- [x] Pruebas: unitarias de crianza, destilación, balance, embotellado y códigos; e2e `embotellado.spec.ts` (candado sin cumplir, `TRC_BOTTLING_EXCEEDS_VOLUME`, `TRC_ALCOHOL_BALANCE_EXCEEDED`, embotellado válido, CSV, ZIP, anulación con sustituto, `TRC_LOT_ALREADY_BOTTLED`, operario) y los flujos de crianza y destilación (`TRC_VOLUME_EXCEEDS_AVAILABLE`, `TRC_MASS_BALANCE_EXCEEDED`) · 2026-10-02
