# Keyhole — Tech Stack

## Overview
Monorepo `api/` + `web/` on one Vercel project. Hybrid: tRPC for dashboard (admin),
REST + Zod + OpenAPI for agents. Single user, free tier.

## Components (as built)
- **API:** Hono 4 on Vercel Functions (`api/vercel-entry.ts` via `hono/vercel`,
  Node 24), TypeScript strict. `secureHeaders()` on all responses.
  - `/trpc/*` — tRPC 11 (fetch adapter), superjson, better-auth cookie gate.
  - `/api/v1/*` — Hono REST, `@hono/zod-validator`, Bearer `kh_live_*` gate.
  - `/api/openapi.json` — hand-built 3.1 doc; request bodies/query shapes
    generated from the live Zod schemas (`z.toJSONSchema`); spec↔routes
    conformance enforced by test.
  - `/api/health` — static `{ ok, service, phase }` liveness probe.
- **Web:** Vite 6 + React + Tailwind (shadcn deferred — not yet used), static
  `web/dist`. Single-page App (login gate, connect card, keys, audit) +
  static `/privacy.html`, `/robots.txt`, and `/skill.md` (byte-copy of root
  `SKILL.md` via web prebuild; never edit the copy).
- **Admin auth:** better-auth + Google social provider, `ADMIN_EMAILS` allowlist
  enforced twice (create-gate hook + per-request tRPC check). Friendly failures
  via `onAPIError.errorURL`. Memory adapter fallback when `DATABASE_URL` unset.
- **Data connect:** custom Hono routes `/api/oauth/google/*`, Google `calendar`
  scope + `access_type=offline&prompt=consent`, stateless HMAC OAuth state,
  lazy refresh with single-flight + forced `refreshNow` retry-once on 401.
  Disabled on non-prod `APP_URL` (preview isolation).
- **Agent auth:** `kh_live_<32B base64url>`, SHA-256 hash stored, `timingSafeEqual`
  compare, scopes `calendar:read` / `calendar:write`, `expires_at`,
  per-key daily counter (429 + `Retry-After` over limit), `last_used_at` update.
- **DB:** Neon Postgres + Drizzle ORM + drizzle-kit (`neon-http` driver).
  Tables: `user/session/account/verification` (better-auth core shape),
  `connected_accounts`, `api_keys`, `audit_logs` (10k prune, `created_at` index).
- **Google:** `googleapis` calendar v3 server-only. Trash = PATCH
  `status: cancelled` (`events.trash` missing from v144 typings). Errors mapped
  to agent-friendly JSON + `Retry-After` on 429. Reads lag writes: expect
  transient `cancelled` tombstones on immediate read-after-delete.
- **Validation:** Zod v4 schemas in `api/src/schemas/` shared by REST + OpenAPI.
- **Crypto:** AES-256-GCM, `DATA_ENCRYPTION_KEY` (32B hex), per-row random IV.
- **Services:** `api/src/services/calendar.ts` (backend/normalize/error map),
  `api-keys.ts` (mint/verify/usage), `google-tokens.ts` (single-flight store).
- **Dev:** `pnpm dev` (api :8787 + web :5173), `pnpm db:migrate`, `pnpm db:studio`
  (prefer Neon branch DB), `TEST_CALENDAR_ID` for e2e —
  never touch primary calendar.

## Deploy (as built)
- `vercel.json` (legacy `builds`): `@vercel/node` on `api/vercel-entry.ts`
  (**named** GET/POST/… exports — a default export hangs, see AGENT.md),
  `@vercel/static-build` on root `package.json` serving `web/dist`.
  Routes: `/api/*`, `/trpc/*` → function; skill/privacy/robots/assets explicit;
  SPA fallback last (it swallows anything not listed — assets included).
  Edge headers: nosniff, DENY framing, strict referrer, minimal
  Permissions-Policy, HSTS.

## Env
```
DATABASE_URL, AUTH_SECRET, AUTH_GOOGLE_ID/SECRET,
GCAL_CLIENT_ID/SECRET, DATA_ENCRYPTION_KEY (hex 32B),
ADMIN_EMAILS, APP_URL (no trailing slash), PROD_APP_URL (enables OAuth in prod),
API_KEY_DAILY_LIMIT (default 2000), TEST_CALENDAR_ID (dev/e2e only)
```

## Free-tier notes
No Redis/cron — refresh lazily, prune audit on insert, no polling.
Vercel Hobby timeouts: keep proxy handlers short, no long-poll.
Migrations: `db:migrate` runs `api/src/db/migrate.ts` (neon-http/migrator over
HTTPS) because drizzle-kit migrate/push take a WS driver path that fails here.
No transactions in the HTTP migrator — a failed migration does not roll back.
Local `.env` is loaded file-relatively in `api/src/lib/env.ts` (tsx has no
auto .env loading); no-op on Vercel.
