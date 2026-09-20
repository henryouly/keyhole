import { Hono } from "hono";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { auth } from "./lib/auth.js";
import { env } from "./lib/env.js";
import { appRouter, createContext } from "./trpc/router.js";

// Extension points (later phases):
// - /api/v1/* → agent REST, Bearer kh_live_* gate (Phase 3)
// - /api/oauth/google/* → data-connect OAuth (Phase 2)
const app = new Hono();

app.get("/api/health", (c) => {
  return c.json({ ok: true, service: "keyhole-api", phase: 1 });
});

// better-auth: login, callback, session, sign-out.
app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

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

// Local dev entrypoint (Vercel uses api/[[...route]].ts in Phase 6).
if (process.env.NODE_ENV !== "production") {
  const { serve } = await import("@hono/node-server");
  serve({ fetch: app.fetch, port: env.API_PORT });
  console.log(`keyhole api listening on :${env.API_PORT}`);
}
