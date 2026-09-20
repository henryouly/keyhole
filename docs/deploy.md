# Keyhole — deploy.md

## 0. Prerequisites
Vercel + Neon + Google account (single admin email). Start with `*.vercel.app`.

## 1. Google Cloud Console (~10 min)
1. New project `keyhole` → enable **Google Calendar API**.
2. OAuth consent: External, **Test Mode**, add yourself as Test user.
   Scopes: `.../auth/calendar`, `openid`, `email`, `profile`.
3. Two OAuth clients (same project):
   - `keyhole-admin`: redirect `https://<app>.vercel.app/api/auth/callback/google`
   - `keyhole-data`: redirect `https://<app>.vercel.app/api/oauth/google/callback`
     (`access_type=offline&prompt=consent` requested at runtime).
4. Save `GCAL_CLIENT_ID/SECRET` + `AUTH_GOOGLE_ID/SECRET`.
5. Add `http://localhost:5173` + local callback URLs to both clients for dev (optional).

> Production verification deferred. `/privacy` page in `web/` satisfies test-mode
> requirements; full verification (homepage, video) needed only if leaving Test Mode.

## 2. Neon (~3 min)
1. New project `keyhole`, copy pooled `DATABASE_URL`.
2. Local: `pnpm db:migrate`. Verify `users`, `connected_accounts`, `api_keys`, `audit_logs`.

## 3. Vercel (~5 min)
Import repo. Build `pnpm build`, output `web/dist`.
`api/[[...route]].ts` serves `/api/*` + `/trpc/*`. Env (all environments):
```
DATABASE_URL=
AUTH_SECRET= # openssl rand -base64 32
AUTH_GOOGLE_ID= / AUTH_GOOGLE_SECRET=
GCAL_CLIENT_ID= / GCAL_CLIENT_SECRET=
DATA_ENCRYPTION_KEY= # openssl rand -hex 32
ADMIN_EMAILS=you@gmail.com
APP_URL=https://<app>.vercel.app
```
Preview env: use Neon branch DB or disable OAuth (code gate on non-prod `APP_URL`).

## 4. Verify
1. `/` → Google login; non-allowlisted blocked.
2. Dashboard → Connect Calendar → Connected.
3. `kh_live_*` (read) → `GET /api/v1/calendars` 200; POST event → 403.
   New key (write) → CRUD 200 against `TEST_CALENDAR_ID` first.
4. `/api/openapi.json`, `/skill.md`, `/privacy` load. `/api/health` ok.

## Rollback / recovery
Dashboard → revoke key / disconnect Google (< 1 min effect).
Leaked secret → rotate env + redeploy. Lost `DATA_ENCRYPTION_KEY` → reconnect Google.
Secrets backed up in 1Password.
