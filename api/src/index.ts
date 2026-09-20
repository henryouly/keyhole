import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { auth } from "./lib/auth.js";
import { env } from "./lib/env.js";
import { appRouter, createContext } from "./trpc/router.js";

// Extension points (later phases):
// - /api/v1/* → agent REST, Bearer kh_live_* gate (Phase 3)
import oauth from "./rest/oauth.js";
import v1 from "./rest/v1.js";
import { buildOpenApi } from "./rest/openapi.js";
const app = new Hono();

// No HTML/JS served here (JSON + API only): strict transport headers are safe.
app.use(secureHeaders());

app.get("/api/health", (c) => {
  return c.json({ ok: true, service: "keyhole-api", phase: 5 });
});

// better-auth: login, callback, session, sign-out.
app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

// Google data-connect OAuth (admin session + prod gate inside).
app.route("/api/oauth", oauth);

// Agent API (Bearer kh_live_* gate + audit inside).
app.route("/api/v1", v1);

// Machine-readable API contract for agents (see SKILL.md).
// The skill itself is served statically at /skill.md (web/dist copy of root
// SKILL.md) so the serverless bundle has no file-system dependency.
app.get("/api/openapi.json", (c) => c.json(buildOpenApi(env.APP_URL)));

// Admin tRPC (better-auth cookie gate inside adminProcedure).
app.use("/trpc/*", (c) =>
  fetchRequestHandler({
    endpoint: "/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext: () => createContext({ req: c.req.raw }),
  }),
);

export default app;

// Local dev entrypoint (Vercel uses api/vercel-entry.ts, see vercel.json).
// Skipped under vitest (NODE_ENV=test) so tests may import the app safely.
if (process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test") {
  const { serve } = await import("@hono/node-server");
  serve({ fetch: app.fetch, port: env.API_PORT });
  console.log(`keyhole api listening on :${env.API_PORT}`);
}
