# Keyhole — Tech Stack

## Overview
Monorepo `api/` + `web/` on one Vercel project. Hybrid: tRPC for dashboard (admin),
REST + Zod + OpenAPI for agents. Single user, free tier.

## Components
- **API:** Hono 4 on Vercel Functions (`api/[[...route]].ts`), TypeScript strict, Node 20.
  - `/trpc/*` — tRPC 11 (fetch adapter), superjson, better-auth cookie gate.
  - `/api/v1/*` — Hono REST, `@hono/zod-validator`, Bearer `kh_live_*` gate.
  - `/api/openapi.json` — via `@hono/zod-openapi` (agent contract).
  - `/api/health` — DB latency + Google connection status.
  - `/skill.md` — serves static SKILL.md.
- **Web:** Vite 6 + React + Tailwind + shadcn/ui (static `web/dist`),
  `@trpc/react-query` + superjson. Routes: `/` (login gate), `/dashboard`,
  `/privacy` (required for Google). `robots.txt` disallows all.
- **Admin auth:** better-auth + Google social provider, `ADMIN_EMAILS` allowlist.
  Sessions: cookie, short expiry. Distinct from data-connect OAuth.
- **Data connect:** custom Hono routes `/api/oauth/google/*`, Google `calendar`
  scope + `access_type=offline&prompt=consent`. Lazy refresh with single-flight
  (concurrent-refresh race guard). Disabled on non-prod `APP_URL`.
- **Agent auth:** `kh_live_<32B base64url>`, SHA-256 hash stored, `timingSafeEqual`
  compare, scopes `calendar:read` / `calendar:write`, `expires_at`,
  per-key daily counter (429 over limit), `last_used_at` update.
- **DB:** Neon Postgres Free + Drizzle ORM + drizzle-kit (`neon-http` driver).
  Tables: `users`, `connected_accounts(provider, account_email, access_enc,
  refresh_enc, expires_at, scopes)`, `api_keys(id, name, prefix, hash, scopes[],
  expires_at, revoked_at, daily_count, daily_window, last_used_at)`,
  `audit_logs(api_key_prefix, method, path, status, ms, created_at)` — pruned to 10k.
- **Google:** `googleapis` calendar v3 server-only. Errors mapped to
  agent-friendly JSON + `Retry-After` on 429.
- **Validation:** Zod schemas in `api/src/schemas/` shared by tRPC + REST + OpenAPI.
- **Crypto:** AES-256-GCM, `DATA_ENCRYPTION_KEY` (32B hex), per-row random IV.
  Redaction helper: never log `Authorization`, tokens, or encryption key.
- **Services (shared):** `api/src/services/calendar.ts`, `keys.ts`,
  `providers/google-calendar.ts` implementing `DataProvider` interface.
- **Dev:** `pnpm dev` (api + web), `pnpm db:migrate`, `pnpm db:studio`
  (drizzle-kit studio, prefer Neon branch DB), `TEST_CALENDAR_ID` for e2e —
  never touch primary calendar.

## Env
```
DATABASE_URL, AUTH_SECRET, AUTH_GOOGLE_ID/SECRET,
GCAL_CLIENT_ID/SECRET, DATA_ENCRYPTION_KEY (hex 32B),
ADMIN_EMAILS, APP_URL, TEST_CALENDAR_ID (dev/e2e only)
```

## Free-tier notes
No Redis/cron — refresh lazily, prune audit on insert, no polling.
Vercel Hobby timeouts: keep proxy handlers short, no long-poll.
Migrations: `db:migrate` runs `api/src/db/migrate.ts` (neon-http/migrator over
HTTPS) because drizzle-kit migrate/push take a WS driver path that fails here.
No transactions in the HTTP migrator — a failed migration does not roll back.
Local `.env` is loaded file-relatively in `api/src/lib/env.ts` (tsx has no
auto .env loading); no-op on Vercel.
