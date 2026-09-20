# AGENT.md — Keyhole

## What is this?
Personal OAuth → scoped-key bridge. Hono API + Vite SPA monorepo.
Admin via tRPC + better-auth; agents via Hono REST + Bearer `kh_live_*`.

## Stack
Hono 4, tRPC 11, Vite 6 React, Zod, Drizzle + Neon, better-auth Google,
Tailwind + shadcn/ui. TS strict, pnpm workspaces (`api/`, `web/`).

## Commands
- `pnpm dev` — api + web (:5173)
- `pnpm build` / `pnpm lint` / `pnpm test`
- `pnpm db:migrate` / `pnpm db:push` / `pnpm db:studio`
- E2E needs `TEST_CALENDAR_ID` — never touch primary calendar.

## Testing

- Layers (run in order): `pnpm typecheck` → `pnpm build` → `pnpm test` →
  manual API check below. All four must pass before declaring a phase done.
- `pnpm test` runs per-package suites. No runner is installed yet (scripts are
  placeholders); when adding tests, use vitest per package
  (`api/src/**/*.test.ts`, `web/src/**/*.test.ts`), `pnpm --filter ./api test`.
- Unit-test services, not routers: scope gate (401/403/429 matrix), key hashing,
  AES-GCM round-trip, idempotencyKey mapping, trash-unless-confirm.
  Routers stay thin; one happy-path test per endpoint is enough.
- Never use real Google tokens or the primary calendar in tests. Unit tests use
  fakes for `DataProvider`/token store. Live checks use `TEST_CALENDAR_ID` only.
- Manual API check (dev servers running):
  `curl localhost:8787/api/health` → `{"ok":true,...}`;
  key matrix via `curl -H "Authorization: Bearer kh_live_..." localhost:8787/api/v1/...`
  expecting 200 / 403 (wrong scope) / 401 (revoked/expired).
- Dashboard check: `pnpm --filter ./web dev`, open `:5173`, confirm health
  payload renders and no token/secret appears in Network tab or console.

## Structure
- `api/src/{trpc/,rest/,services/,db/,lib/}` — routers thin, logic in `services/`
- `api/src/schemas/` — Zod shared by tRPC + REST + OpenAPI
- `api/src/services/providers/` — `DataProvider` implementations
- `web/src/` — dashboard only; no Google tokens here ever.

## Hard rules
1. NEVER log/print `Authorization`, `access_token`, `refresh_token`, `DATA_ENCRYPTION_KEY`.
2. Agent REST stays OpenAPI-compatible — no tRPC-only types leak to `/api/v1`.
3. All dates UTC + `timeZone` echoed; list defaults `maxResults=25`, 90d window.
4. Deletes = trash unless `confirm:true`; creates honor `idempotencyKey`.
5. Encrypt at rest (AES-256-GCM), hash keys (SHA-256), `timingSafeEqual` compare.
6. Audit every `/api/v1` call; prune `audit_logs` to 10k.
7. Preview builds: OAuth disabled unless prod `APP_URL`.

## Adding a provider
Implement `DataProvider` in `api/src/services/providers/` — no new auth patterns,
reuse encrypted token store + scope gate.

## Key hygiene
One key per agent, named, 90d default expiry. Show once. Revoke instantly.
