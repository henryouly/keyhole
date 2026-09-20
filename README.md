# Keyhole

Personal OAuth → scoped-key bridge. Connect your own Google Calendar once;
hand your agents (`kh_live_*` keys) scoped, revocable access — they never see
your Google credentials.

- **Dashboard:** connect/disconnect Google, mint/revoke API keys, audit log.
- **Agent API:** `GET/POST /api/v1/...` with Bearer keys (`calendar:read` /
  `calendar:write`), OpenAPI at `/api/openapi.json`, guide at `/skill.md`.
- **Docs:** `docs/goal.md` (what/why), `docs/tech_stack.md` (stack),
  `docs/deploy.md` (hosting), `docs/run_book.md` (incidents), `AGENT.md`
  (contributor rules for coding agents), `SKILL.md` (agent consumer guide).

## Quickstart

Prereqs: Node 20+, pnpm 10, a Neon Postgres DB, Google Cloud OAuth clients
(see `docs/deploy.md` step 1).

```bash
pnpm install
cp .env.example .env   # fill in; secrets also go to 1Password
pnpm db:migrate        # apply drizzle/ SQL to Neon (HTTP, no WS needed)
pnpm dev               # api :8787 + web :5173
```

## Scripts

| Command | What |
|---|---|
| `pnpm dev` | api + web with hot reload |
| `pnpm build` / `typecheck` / `test` | all workspaces (must all pass per phase) |
| `pnpm db:migrate` | apply pending migrations (HTTP migrator) |
| `pnpm db:push` / `db:studio` | prototype sync / DB browser (prefer a Neon branch) |
| `pnpm --filter ./api test` | api unit suite (vitest) |

## Project structure

```
api/src/{lib,db,trpc,rest,services,schemas}  Hono API + tRPC + Drizzle
api/drizzle/        generated SQL migrations (committed)
api/vercel-entry.ts Vercel serverless entry (hono/vercel)
web/src/            Vite + React dashboard (tRPC client)
web/public/         robots.txt, privacy.html (+ generated skill.md, gitignored)
SKILL.md            agent skill source of truth (root; copied to web/dist)
vercel.json         builds/routes/security headers
```

## Security model (summary)

Google tokens AES-256-GCM encrypted at rest, never logged or returned.
Agent keys store only SHA-256 hashes. Admin = Google login + email allowlist,
enforced at user-create AND per request. Full rules in `AGENT.md`.
