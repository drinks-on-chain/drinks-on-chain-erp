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

- [ ] Directorio de terroirs con búsqueda, pills por cepa y DoBadge
- [ ] Ficha, alta y edición de terroir (certificado D.O. vía uploads)

## 1C · Vendimia y vinificación

- [ ] Pesaje con BigNumberInput (Brix, pH y acidez obligatorios)
- [ ] Análisis y dictamen fitosanitario
- [x] TankGrid, bitácora, tratamientos y decisión de destino al crear el tanque · 2026-09-25

## 1D · Crianza y destilación

- [x] Barricas con CountdownLock · 2026-09-25
- [x] Cortes del alambique y candado de reposo de 180 días · 2026-09-25

## 1E · Envasado y QR

- [ ] Embotellado con conciliación y bloqueo por candado (422)
- [ ] Éxito con sello, certificado de laboratorio y exportación de QR

## 1F · Cuenta de la bodega

- [ ] Panel de solo lectura de la cuenta Stellar

## 1G · Calidad

- [ ] Estados en todas las pantallas, teclado, lector de pantalla
- [ ] Playwright del flujo "Singani Gran Reserva 2026" de origen a QR
- [ ] Integración temprana: login y origen contra el backend real
