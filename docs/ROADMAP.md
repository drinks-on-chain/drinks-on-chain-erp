# Roadmap del ERP (Etapa 1)

Detalle de `docs/03-roadmap-frontend.md` §4. Se marca con fecha cuando la sub-etapa cumple lo previsto y está en `dev`.

## 1A · Acceso y panel

- [x] Proyecto desde la plantilla (puerto 3002, capa de datos de las 45 operaciones, permisos por rol) · 2026-09-25
- [x] Login dividido y recuperación de acceso (informativa: el backend no tiene endpoint) · 2026-09-25
- [x] AppShell con módulos, bodega activa, usuario y control de acceso por rol · 2026-09-25
- [x] Panel: cifras, tareas pendientes derivadas y candados activos · 2026-09-25
- [ ] Perfil (`GET/PATCH /v1/users/me`)
- [ ] Ajustes de la bodega y miembros (`/v1/wineries/my`, `/members`)
- [ ] Selector de bodega: sin endpoint para cambiar de bodega activa (punto nuevo de alineación con backend)

## 1B · Origen

- [x] Directorio de terroirs con búsqueda, pills por cepa y DoBadge · 2026-09-25
- [x] Ficha, alta y edición de terroir (certificado D.O. vía uploads) · 2026-09-25

## 1C · Vendimia y vinificación

- [x] Pesaje con BigNumberInput (Brix, pH y acidez obligatorios) · 2026-09-25
- [x] Análisis y dictamen fitosanitario · 2026-09-25
- [ ] TankGrid, bitácora, tratamientos y decisión de destino al crear el tanque

## 1D · Crianza y destilación

- [ ] Barricas con CountdownLock
- [ ] Cortes del alambique y candado de reposo de 180 días

## 1E · Envasado y QR

- [ ] Embotellado con conciliación y bloqueo por candado (422)
- [ ] Éxito con sello, certificado de laboratorio y exportación de QR

## 1F · Cuenta de la bodega

- [ ] Panel de solo lectura de la cuenta Stellar

## 1G · Calidad

- [ ] Estados en todas las pantallas, teclado, lector de pantalla
- [ ] Playwright del flujo "Singani Gran Reserva 2026" de origen a QR
- [ ] Integración temprana: login y origen contra el backend real
