# Roadmap del ERP (Etapa 1)

Detalle de `docs/03-roadmap-frontend.md` §4. Se marca con fecha cuando la sub-etapa cumple lo previsto y está en `dev`.

## 1A · Acceso y panel

- [x] Proyecto desde la plantilla (puerto 3002, capa de datos de las 45 operaciones, permisos por rol) · 2026-09-25
- [x] Login dividido y recuperación de acceso (informativa: el backend no tiene endpoint) · 2026-09-25
- [x] AppShell con módulos, bodega activa, usuario y control de acceso por rol · 2026-09-25
- [x] Panel: cifras, tareas pendientes derivadas y candados activos · 2026-09-25
- [x] Perfil (`GET/PATCH /v1/users/me`) · 2026-09-25
- [x] Ajustes de la bodega y miembros (`/v1/wineries/my`, `/members`, alta con `/members/create`) · 2026-09-25
- [ ] Selector de bodega: sin endpoint para cambiar de bodega activa (punto nuevo de alineación con backend)

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
