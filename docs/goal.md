# Keyhole — Goal

## Problem
Personal agents (OpenClaw, Hermes) need access to my Google Calendar,
but giving them Google OAuth tokens/credentials is unsafe and unscoped.

## Goal
A single-user web app hosted on Vercel that connects to my own data via OAuth
and re-exposes it to my agents via scoped API keys — without ever exposing
Google credentials to agents.

Project name: **Keyhole**. API key prefix: `kh_live_*`.

## MVP Success Criteria
1. I can Google-login to admin dashboard (better-auth, `ADMIN_EMAILS` allowlist only).
2. I can click "Connect Google Calendar", grant full `calendar` scope (offline),
   and see connection status. Test Mode + test user; `/privacy` page exists.
3. I can create/revoke API keys with scopes `calendar:read` and/or `calendar:write`
   + expiry (default 90d) + per-key daily counter. Key shown once at creation.
4. Agent with `Authorization: Bearer kh_live_*` can: list calendars,
   list/get/create/update/delete events.
5. Key without `calendar:write` gets 403 on writes. Expired/revoked/over-quota key
   gets 401/429. Preview deploys have OAuth disabled (prod data isolation).
6. `GET /api/openapi.json` + `/skill.md` (static SKILL.md) lets a fresh agent
   complete 5 calendar tasks with only the API key.
7. Google access/refresh tokens are AES-256-GCM encrypted at rest, never logged
   or returned to agents. Audit log capped at 10k rows.

## Calendar Defaults (locked)
- UTC in/out, `timeZone` echoed; `singleEvents=true`.
- List defaults `maxResults=25`, `timeMin/timeMax` required, max 90-day window.
- Create accepts `idempotencyKey` → `extendedProperties.private.khKey` (dedupe).
- Delete = trash unless `confirm:true` (hard delete only with explicit confirm).
- SKILL.md instructs: ask user before bulk / recurring-series deletes.

## Non-Goals (MVP)
- No multi-user, no team sharing, no billing.
- No MCP server (REST only; tRPC internal only; MCP can wrap REST later).
- No Gmail/Outlook — `DataProvider` interface reserved, only `google-calendar` implemented.
- No fine-grained per-calendar ACLs (service + read/write only).

## Control Principle
User revokes access by (a) revoking API key instantly, or (b) disconnecting Google.
Either takes effect < 1 min, no agent-side cleanup needed. One key per agent
(openclaw, hermes), no sharing.

## Safety / Ops (locked 1–7)
1. Preview deploys: OAuth disabled unless `APP_URL` == prod.
2. Secrets (`DATA_ENCRYPTION_KEY`, `AUTH_SECRET`, `DATABASE_URL`) backed up in 1Password.
3. Key hygiene: named keys, 90d default expiry, last-used display.
4. `robots.txt: disallow all`, no public signup, `/` redirects to login.
5. Free-tier discipline: on-demand proxy only (no polling), paginated dashboard,
   `/api/health` (DB latency + Google status).
6. Agent safety via SKILL.md confirmation rules.
7. API versioned at `/api/v1` from day 1.
