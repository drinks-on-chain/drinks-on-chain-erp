@AGENTS.md

# drinks-on-chain-app-template

Plantilla de las aplicaciones de Drinks on Chain. Lee también el `CLAUDE.md` de la carpeta paraguas y `docs/` (roadmap 03, contrato 09).

- Trabajo en `dev`, PR `dev → main`, Conventional Commits; commits con autor `brayan gomez <brayankgr@gmail.com>`.
- Antes de un PR: `pnpm lint && pnpm typecheck && pnpm test && pnpm build` y `pnpm e2e`.
- Las pantallas nunca llaman a `fetch` ni conocen URLs: usan hooks sobre `src/lib/api` y los esquemas de `@drinks-on-chain/mocks`.
- Toda pantalla tiene estados cargando (skeleton), vacío (EmptyState con acción) y error (ErrorState con reintento).
- Textos en `src/lib/i18n/es.ts`; solo español.
- Componentes de UI de `@drinks-on-chain/ui`; si falta uno reutilizable, se añade allí, no aquí.
- Los shells necesitan `Link` y `usePathname()`: se montan en un componente cliente propio (`src/components/app-frame.tsx`).
- Puerto local 3009.
