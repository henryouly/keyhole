# Keyhole — Roadmap

> Status: Phases 0–6 shipped and deployed (`keyhole-two.vercel.app`).
> Remaining: Phase 7 ideas below. This doc is now history; new work gets new plans.

## Phase 0 — Scaffold → verify: `pnpm build` passes
`pnpm-workspace.yaml`, `api/` (Hono + tRPC + Zod + Drizzle), `web/` (Vite + React +
Tailwind + shadcn), env template, `/api/health`.

## Phase 1 — Admin auth + DB → verify: non-allowlisted blocked
better-auth Google + `ADMIN_EMAILS` gate, `users` table, tRPC `viewer.me`,
middleware protecting `/dashboard` + `/trpc/*` admin routes.

## Phase 2 — Encrypted Google connect → verify: reconnect works
`connected_accounts` + AES-GCM lib, `/api/oauth/google/*` (calendar, offline),
dashboard connect card, token status, prod-only gate.

## Phase 3 — API keys → verify: 401/403/429 matrix passes
`kh_live_*` gen (hash stored, shown once), scopes + expiry + daily counter,
revoke, Hono Bearer middleware, `audit_logs` + 10k prune.

## Phase 4 — Calendar proxy → verify: `curl` CRUD e2e on TEST_CALENDAR_ID
`GET /v1/calendars`, `GET/POST /v1/calendars/:id/events`,
`GET/PATCH/DELETE /v1/events/:id`. Zod I/O, UTC + timeZone, max 25 / 90d window,
`singleEvents`, idempotencyKey, trash-unless-confirm, lazy single-flight refresh,
Google error mapping.

## Phase 5 — Dashboard (tRPC) + Skill → verify: fresh agent 5-task test
Dashboard key table + audit via tRPC; static `SKILL.md` + `/skill.md` route +
`/api/openapi.json`; test with OpenClaw/Hermes using only key + skill.

## Phase 6 — Harden + docs → verify: from-scratch deploy via deploy.md
Redaction audit, security headers, `robots: noindex`, `/privacy`, preview-OAuth
gate, `pnpm db:studio` documented, README + RUNBOOK (revoke).

## Phase 7 (post-MVP)
Per-calendar ACLs, rate-limit tuning, Gmail provider, MCP wrapper over REST,
Google verification for production.
