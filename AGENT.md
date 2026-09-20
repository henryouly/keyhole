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
  manual API check below. All four must pass before declaring work done.
- api suite is vitest (`api/src/**/*.test.ts`, `pnpm --filter ./api test`);
  `api/vitest.setup.ts` stubs test-only secrets + dummy DB (dotenv never
  overrides setup env; dbAudit swallows the refused connection).
- Unit-test services, not routers: scope gate (401/403/429 matrix), key hashing,
  AES-GCM round-trip, idempotencyKey mapping, trash-unless-confirm, token
  single-flight + forced refresh, error mapping.
- The openapi conformance test asserts every documented path answers 401
  (not 404) unauthenticated — a route/spec drift fails the suite.
- Never use real Google tokens or the primary calendar in tests. Unit tests use
  fakes for backends/stores. Live checks use `TEST_CALENDAR_ID` only, via
  throwaway `api/src/db/*.ts` scripts that mint-then-delete their own keys and
  purge probe events; delete the scripts afterwards. Never commit test keys.
- Manual API check (dev servers running):
  `curl localhost:8787/api/health` → `{"ok":true,...}`;
  key matrix via `curl -H "Authorization: Bearer kh_live_..." localhost:8787/api/v1/...`
  expecting 200 / 403 (wrong scope) / 401 (revoked/expired).
- `api/` uses NodeNext resolution: relative imports need explicit `.js`
  extensions (`./admin.js`), even though the source file is `.ts`.
- Hono typing: apps mounting agent middleware need `new Hono<AgentEnv>()`
  or `c.get("agent")` types as `never`. tRPC queries are GET-only (POST → 405).
  Middleware order is auth → scope → Zod validators, so unauthenticated calls
  401 before any 400.
- Dashboard check: `pnpm --filter ./web dev`, open `:5173`, confirm health
  payload renders and no token/secret appears in Network tab or console.

## Gotchas (learned the hard way)

- **Vercel entry must use named exports** (`export const GET/POST/...`), never a
  default export: `@vercel/node` treats a default export as a Node `(req, res)`
  handler and silently drops returned Responses — every request hangs to the
  300s timeout. The runtime log says exactly this; trust it.
- **Legacy `builds` skip the top-level buildCommand.** `web/dist/**` as a static
  source matches nothing unless something builds it: use
  `@vercel/static-build` on `package.json` (runs the root build, serves
  `distDir`), not `@vercel/static` on a path you assume exists.
- **SPA fallback swallows static assets.** Any `/(.*) → /index.html` route must
  come after explicit passthroughs (`/assets/*`, `/skill.md`, …), or JS/CSS
  return the HTML shell with 200 and the page renders blank.
- **drizzle-kit migrate/push take the WS driver path** when
  `@neondatabase/serverless` is installed, and fail here. `db:migrate` runs
  `api/src/db/migrate.ts` (`neon-http/migrator` over HTTPS) instead.
  No transactions there — a failed migration does not roll back.
- **tsx never auto-loads `.env`.** `api/src/lib/env.ts` loads the repo-root
  file explicitly (file-relative URL, no-op on Vercel). Without it, local dev
  silently runs on defaults.
- **googleapis v144 has no `events.trash` in typings.** Trash = PATCH
  `{ status: "cancelled" }` (documented equivalent, restorable).
- **Google reads lag writes.** Immediate get-after-delete can return the
  `cancelled` tombstone with 200; listings exclude it at once, direct reads
  404 shortly after. Tests/agents must not assert instant 404.
- **Google OAuth redirect URIs are exact-match + slow.** `redirect_uri_mismatch`
  is always a typo, wrong client (admin vs data), trailing slash, or
  propagation delay (up to ~5 min). `APP_URL` itself must have no trailing slash.
- **better-auth specifics:** user-create gate = `databaseHooks.user.create.before`
  returning `false`; friendly failures need `onAPIError: { errorURL }`
  (default is the raw `/api/auth/error` page); without `DATABASE_URL` the app
  falls back to the memory adapter (dev/tests only).
- **Base64 tamper tests:** flip a bit in the FIRST char, not the last — trailing
  bits may be padding and decode to identical bytes (test passes vacuously).

## Structure
- `api/src/{trpc/,rest/,services/,db/,lib/}` — routers thin, logic in `services/`
- `api/src/schemas/` — Zod shared by tRPC + REST + OpenAPI
- `api/src/services/providers/` — `DataProvider` implementations
- `web/src/` — dashboard only; no Google tokens here ever.
- Root `SKILL.md` is the agent skill source of truth; `web/public/skill.md`
  is generated from it by web prebuild (never edit the copy).
- `api/vercel-entry.ts` + `vercel.json` own prod routing/headers; onAPIError
  errorURL and OAuth prod-gate live in `api/src/lib/`.

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
