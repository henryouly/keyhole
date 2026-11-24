---
name: create-verification-skill
description: "Generate a project-local verification skill that drives your app the way a user does — any language, framework, or platform. Use for /create-verification-skill, \"make a control skill for this repo\", or when a project has no scripted way to prove UI/CLI/service behavior."
disable-model-invocation: true
---

# Create a verification skill

Every serious project needs a scripted way to drive the real app and prove behavior: launch it, exercise a feature the way a user would, and capture evidence. This skill generates that as a project-local skill (`.agents/skills/verify-<app>/`) tailored to the repo. You write the generator's output for the next agent, not for a human: it will be read cold, mid-task, by an agent that has never seen the app.

> **Keyhole note:** Never edit or overwrite root `SKILL.md` — that file is the Keyhole Calendar *consumer* skill served at `/skill.md`. Contributor verification skills live under `.agents/skills/verify-<app>/`.

## 1. Interview the repo, not the user

Answer these from the codebase and only ask the user what you cannot observe:

- **Surface:** what does a user actually touch? A web UI, a CLI/TUI, a desktop app, an API, a mobile app, a library? A repo can have several; pick the primary one and note the rest. (In Keyhole: the agent REST API on `:8787` at `/api/v1/*`, `/api/health`, `/api/openapi.json` and the admin Vite React dashboard on `:5173` backed by `/trpc/*`.)
- **Run:** how does the app start locally? Prefer the repo's own documented dev command (`pnpm dev`, `pnpm --filter ./api dev`, `pnpm --filter ./web dev`). Note ports, env vars, seed data, auth (e.g., `DATABASE_URL` fallback to better-auth memory adapter, `PROD_APP_URL` OAuth gate, `.env` loading in `api/src/lib/env.ts`).
- **Drive:** how can an agent interact with it programmatically? Existing harnesses first — Vitest suites, `curl` against `/api/v1/*` and `/api/health`, Playwright/browser automation for `:5173`. Only then pick a generic recipe: browser/CDP for web, PTY/tmux for CLI/TUI, plain HTTP for services.
- **Observe:** what evidence can be captured? Screenshots, ARIA snapshots, response bodies, HTTP status codes, logs, exit codes, DB/audit state.
- **Isolate:** can two instances run side by side (ports, data dirs, DB branches, throwaway API keys)? If not, say so in the generated skill: refusing to double-drive a shared instance beats corrupting the user's session.

If the checkout doesn't build or start as-is, fix that first (or report it precisely) before generating; a skill written against a broken base teaches wrong steps. When an irrelevant missing asset blocks startup (a static dir the API never serves, a sample config), the generated skill may create it, clearly marked as verification scaffolding, and remove it in cleanup.

### Keyhole safety constraints (must carry into any generated skill)

- **Never touch the primary calendar or commit test keys.** Live Google Calendar checks must target `TEST_CALENDAR_ID` only, mint-and-delete throwaway keys, and purge probe events in cleanup.
- **Never log or persist secrets in evidence.** Redact `Authorization`, `kh_live_*` raw keys, `access_token`, `refresh_token`, and `DATA_ENCRYPTION_KEY` from all captured artifacts, transcripts, and screenshots.
- **Account for Google read-after-write lag.** Immediate get-after-delete can return a `status: "cancelled"` tombstone with HTTP 200; verify deletes via the delete response and listings, not an instant 404.

## 2. Generate the skill

Write `.agents/skills/verify-<app>/SKILL.md` with YAML frontmatter (`name: verify-<app>` and a `description` that names the app, the surface, and when to reach for it — without frontmatter the skill never registers) and these sections, each grounded in what the interview actually found (no placeholders left):

- **Launch:** the exact command that starts the app for verification, and how to tell it's ready (a log line, a health endpoint like `GET /api/health` returning `{"ok":true,...}`). Launch must reach a usable state from an empty state, including any migrations (`pnpm db:migrate` via HTTP migrator) and seed data. Ready means usable, not just that a process answers. Include teardown. For a short-lived CLI or TUI there is no server to keep alive: launch means build once, then start each drive in its own isolated session.
- **Doctor:** one read-only check that answers "is this instance worth driving?" — process up, right version/build, port owned by us, auth valid. An agent runs this first whenever anything looks off.
- **Drive:** the harness recipe with real selectors/commands from this repo, not examples. Prefer stable handles (ARIA labels, data attributes, route paths, OpenAPI endpoints) over coordinates and tab order.
- **Evidence:** what to capture for a proof and where it goes. State the proof standards: exercise the real user path, not internal setters or test-only endpoints; capture the action and the resulting state, not just the final screen; verify side effects (audit rows written, keys revoked, events created/trashed) alongside what's visible; mocks only where a production boundary already isolates the external system. When the safe path is a dry-run or test mode, verify what it actually skips by observing (files, network, DB) rather than trusting its name.
- **Cleanup:** how to tear down instances the run created. Never kill by process name; kill what you started (by PID). Cleanup removes instances, throwaway keys, probe events, and scratch state, never the evidence: proof artifacts survive the teardown, in a location the skill names.
- **Helpers:** any script the skill ships is executable and its invocation is shown in the skill body. A helper the reader has to reverse-engineer is not a helper.

## 3. Seed the feature map

Create `.agents/skills/verify-<app>/features/README.md` plus one file per user-facing feature you can identify (aim for the top 3–5 to start, from routes, commands, menus, or docs). Follow the shape in [`references/feature-map-example/`](references/feature-map-example/), with a README index and one file per feature. Each file answers, from the user's point of view: what the feature is, how to reach it, how to drive it with the harness, and what observable end state proves it works. The four H2s are `Sub-features`, `How to get to it (user POV)`, `Driving it with <harness>`, and `Gotchas`. If the seed data lacks a precondition that a journey needs, the journey reports a failure and the reason goes in that feature's `Gotchas`. Never weaken the journey to make it pass. The map is the repo's maintained verification source; a proof that drives one convenient entry point is incomplete when the map lists others.

## 4. Prove the generated skill before handing it over

Run its own instructions end to end once: launch, doctor, drive ONE mapped feature (one is enough; the map exists so later runs can cover the rest), capture evidence, clean up. After cleanup, confirm the evidence still exists at the named location — a cleanup that eats the proof fails this step. Fix what fails, and run the generated cleanup after every failed iteration too, so broken attempts don't strand processes and ports. A generated skill that was never executed is a draft, not a deliverable. If you proved it in a stand-in for the real target (a local stack in place of Vercel prod, memory adapter in place of Neon), list every setup step the stand-in did that the target will not. Those steps stay unverified until a run on the real target covers them.

## 5. Offer the maintenance loop

Point the user at `/maintain-verification-skill` (`.agents/skills/maintain-verification-skill/`) for keeping the map honest as the app changes. Suggest a cadence only if they ask.
