# Keyhole — run_book.md

Single-user incident playbook. All dashboard actions are under `/` after Google login.

## Revoke an agent key (suspected leak / misbehaving agent)

1. Dashboard → Agent API keys → **Revoke** next to the key prefix.
2. Effect is immediate (< 1 min): in-flight calls finish, the next call 401s.
3. Check Dashboard → Recent agent calls for what that prefix did.
4. Mint a replacement key if the agent still needs access.

## Rotate DATA_ENCRYPTION_KEY

1. Generate: `openssl rand -hex 32`. Save to 1Password first.
2. Set the new value in `.env` (local) and Vercel env (prod), redeploy/restart.
3. Old blobs are unreadable → Dashboard → **Disconnect** then **Connect**
   Google Calendar again (fresh tokens under the new key).
4. No agent keys are affected (hashes don't depend on this key).

## Rotate AUTH_SECRET

Sessions invalidate on next request (everyone re-logs-in). Agent keys unaffected.

## Google OAuth client secret leaked

1. Google Cloud Console → Credentials → regenerate the client secret.
2. Update `AUTH_GOOGLE_SECRET` (admin client) and/or `GCAL_CLIENT_SECRET`
   (data client) in `.env` + Vercel, redeploy/restart.
3. Data-connection tokens stay valid (they're separate). Reconnect only if the
   OAuth client itself was deleted.

## Google grant is dead (agents get 502 google_auth_failed)

The refresh token died (user removed access at myaccount.google.com, or long
inactivity). Dashboard → Disconnect → Connect again. No key changes needed.

## Suspicious audit entries

Dashboard → Recent agent calls shows per-key method/path/status. Revoke first
(see above), then inspect. Audit keeps the last 10,000 rows, oldest pruned first.

## Neon issues

Point-in-time restore / branching is in the Neon dashboard. After restoring to
an older snapshot, re-run `pnpm db:migrate` to re-apply newer migrations.
Prefer a Neon branch (not prod) for `db:push` and `db:studio` experiments.

## Vercel issues

`vercel.json` pins builds/routes/headers. Redeploy from the dashboard after env
changes. Preview deploys get OAuth disabled automatically (prod-URL gate);
they serve the dashboard + API with whatever preview env is configured.
