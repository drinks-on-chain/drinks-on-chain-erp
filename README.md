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

| Variable                                                                    | Uso                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_MOCKS`                                                         | `1` arranca MSW en el navegador (intercepta `/api/v1/*` con `@drinks-on-chain/mocks`) y habilita `/__mocks` en producción. Es lo que usa hoy Vercel                                                                                                                                                                 |
| `API_ORIGIN`                                                                | **Solo servidor.** Origen del backend: `src/proxy.ts` reescribe `/api/v1/*` a `${API_ORIGIN}/v1/*` (P-1, contrato de la Ola 0 §7), así la cookie de renovación `doc_rt` es de primera parte. Obligatoria sin mocks, también **al construir** (se valida en el build). Desarrollo: `https://136.243.223.39.sslip.io` |
| `PROXY_SHARED_SECRET`                                                       | **Solo servidor, nunca `NEXT_PUBLIC_`.** Firma la IP del cliente para el backend (O1-OPS-1): mismo valor que en el backend del entorno (si hay varios separados por comas, firma con el primero). Vacía = sin firma: el backend usa la IP de la conexión                                                            |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`                                            | Clave de Cloudflare Turnstile del formulario de recuperación. Vacía: con mocks se envía un valor de prueba y en desarrollo se usa la clave de prueba pública de Cloudflare (`1x00000000000000000000AA`)                                                                                                             |
| `NEXT_PUBLIC_URL_LANDING`, `NEXT_PUBLIC_URL_BODEGAS`, `NEXT_PUBLIC_URL_APP` | Enlaces a los otros sitios                                                                                                                                                                                                                                                                                          |

Contra el backend de desarrollo: `NEXT_PUBLIC_MOCKS=0` y `API_ORIGIN=https://136.243.223.39.sslip.io`. `NEXT_PUBLIC_API_URL` ya no existe: el navegador nunca llama al backend directamente.

La sesión, la organización activa, las listas y los errores por campo siguen el contrato de la Ola 0 y los trae la plantilla (su README explica la renovación silenciosa y la tolerancia transitoria hasta H1). Con varias membresías, el selector de la cabecera cambia la organización activa (prueba con `sofia@aramayo.test`); los permisos del ERP salen de la membresía activa.

**IP real del cliente** (O1-OPS-1, de la plantilla): `src/proxy.ts` (`src/lib/api-proxy.ts`) reescribe `/api/v1/*` al backend sin tocar método, cuerpo (en streaming, sin límite de tamaño de función), cookies ni respuesta (`Set-Cookie`, `Retry-After`, `Content-Disposition`), y con `PROXY_SHARED_SECRET` añade `X-DOC-Client-IP`, `X-DOC-Proxy-Timestamp` y `X-DOC-Proxy-Signature` (HMAC-SHA256 de `MÉTODO|RUTA_CON_QUERY|IP|TIMESTAMP`, query canónica). La IP sale de `x-real-ip`/`x-forwarded-for`, que en Vercel pone la plataforma; fuera de Vercel hace falta un proxy delante que los reescriba. Las `X-DOC-*` del cliente se descartan.

## Cuenta, organización y equipo (Ola 1, O1-ERP-1)

Contrato: `plan/contratos/o1-backoffice-y-bodegas.md` del plan maestro; mocks `@drinks-on-chain/mocks` 0.3.0-rc.2.

- **Invitaciones** en `/invitacion/[token]`: cuenta nueva (nombre y contraseña con los requisitos a la vista) o existente (entrar con el mismo correo y aceptar); al aceptar se entra con esa bodega activa. Con mocks, los correos llegan al **buzón simulado**: tabla en `/__mocks` o `window.__docMocks.mailbox.latest({ to, template })` en las e2e.
- **Contraseña**: `/recuperar` (con `captchaToken` de Turnstile) → correo → `/restablecer/[token]` (el enlace de los mocks, `/restablecer-contrasena?token=`, redirige ahí); cambio de contraseña y preferencias (idioma, avisos del lote, promociones) en `/perfil`. `/verificar-correo?token=` confirma un correo.
- **Equipo** (`/equipo`): la dirección invita (nunca `OWNER`), reenvía, anula, cambia roles y bloquea o desbloquea (no a sí misma; lo que bloqueó Drinks on Chain se explica y no se ofrece desbloquear); el resto ve nombres y roles. Reglas en `src/features/equipo/team-rules.ts`.
- **Ajustes**: datos de la bodega y **configuración efectiva** (valor y si es estándar o propio). **Bitácora** propia de la dirección en `/ajustes/bitacora` (filtros por fecha y acción, paginada).
- **Bodega no activa**: con la organización activa `INVITED`, `SUSPENDED` o `REVOKED` (o ante un 403 `ORG_NOT_ACTIVE`) el shell muestra una pantalla que explica el estado y qué hacer; el perfil sigue abierto y, en `SUSPENDED`, la dirección ve los datos de la bodega y la bitácora (`src/lib/auth/org-status.ts`).
- **Permisos** por el rol de la membresía activa con la matriz del backend (`src/lib/erp/permissions.ts`): el operario pesa y registra lecturas, contabilidad solo lee; la navegación oculta lo que el rol no puede leer.
- Todas las peticiones llevan `X-Client-App: ERP` (`src/lib/client-app.ts`).

Usuarios de demo útiles: `admin@altos.test` (dueño), `admin@cintiviejo.test` (equipo al límite, bloqueo de la plataforma), `sofia@aramayo.test` (cambia a Casa Uriondo, suspendida), `gerencia@guadalquivir.test` (bodega invitada), `hugo@valleescondido.test` (revocada).

## Prueba contra el backend real

`e2e/backend-real.spec.ts` recorre el ERP contra el backend de desarrollo (O0-ERP-2). Excluida por defecto: no corre con `pnpm e2e` ni en la CI de cada push. Usa las personas de la semilla del backend (README del backend, "Datos de demostración"); su contraseña es la de `SEED_DEMO_PASSWORD` del servidor y **solo** se pasa por el entorno, nunca en archivos, commits ni registros:

```bash
export E2E_PASSWORD="$(ssh drinksonchain-server "sed -n 's/^SEED_DEMO_PASSWORD=//p' ~/doc-dev/.env")"
E2E_REAL_API=1 E2E_API_ORIGIN=https://136.243.223.39.sslip.io E2E_PORT=3150 pnpm e2e --project=escritorio
```

| Variable         | Uso                                                                                                                              |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `E2E_REAL_API`   | `1` activa el modo: solo corre esta prueba, con MSW apagado, un solo worker, sin reintentos ni trazas (guardarían la contraseña) |
| `E2E_API_ORIGIN` | Origen del backend; el build lo usa como `API_ORIGIN`. Por defecto, el de desarrollo                                             |
| `E2E_PASSWORD`   | Contraseña de las personas de demostración. Sin ella solo corre la prueba de credenciales inválidas                              |
| `E2E_REAL_429`   | `1` prueba también el 429 del login con `Retry-After` (suma hasta 8 fallos al bloqueo por IP)                                    |

Recorre: login a través de la reescritura (cookie `doc_rt` de primera parte, `HttpOnly`, nada en el almacenamiento), recarga que mantiene la sesión, los módulos de la dueña de Cinti Viejo con su tiempo de carga (anotaciones de Playwright), alta inocua de una parcela `E2E-<fecha>-<azar>`, un 422 del backend con `details[].field` en el perfil (no guarda nada), cierre de sesión que revoca; Sofía con dos bodegas y cambio a Casa Uriondo (suspendida) y a Altos; el operario sin crianza, destilación, envasado ni parcelas; contabilidad bloqueada por la plataforma. En GitHub hay un job manual (`E2E contra el backend real`, `workflow_dispatch`) que lee el secreto `E2E_PASSWORD` si existe y no sube artefactos.

**Estado (27-09-2026)**: en verde sin parches contra el backend de desarrollo (`b9e8b68`), las 6 pruebas incluido el 429. Las pantallas de la Ola 1 (equipo, invitaciones, bitácora) quedan fuera hasta que el backend publique sus endpoints.

Publicado en Vercel (con datos de prueba): https://drinks-on-chain-erp.vercel.app · panel de usuarios de demo en `/__mocks`.

## Estructura

| Carpeta                      | Qué hay                                                                                                                     |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `src/app/(auth)`             | Login, invitación, recuperación y restablecimiento de contraseña, verificación de correo                                    |
| `src/app/(app)`              | Panel y módulos (origen, vendimia, vinificación, crianza, destilación, envasado, lotes, cuenta, equipo, ajustes y bitácora) |
| `src/lib/erp/resources.ts`   | Un acceso por endpoint del backend, validado con los esquemas zod de `@drinks-on-chain/mocks`                               |
| `src/lib/erp/hooks.ts`       | Hooks de lectura y escritura (TanStack Query) y `useLotViews()`                                                             |
| `src/lib/erp/permissions.ts` | Qué puede hacer cada rol                                                                                                    |
| `src/features/<módulo>`      | Componentes y cálculos de cada módulo                                                                                       |

Avance en [`docs/ROADMAP.md`](docs/ROADMAP.md).
