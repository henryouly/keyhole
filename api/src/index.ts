import { Hono } from "hono";

// Phase 0 scaffold. Extension points (later phases):
// - /trpc/*  → tRPC router, better-auth cookie gate (Phase 1)
// - /api/v1/* → agent REST, Bearer kh_live_* gate (Phase 3)
// - /api/oauth/google/* → data-connect OAuth (Phase 2)
const app = new Hono();

app.get("/api/health", (c) => {
  return c.json({ ok: true, service: "keyhole-api", phase: 0 });
});

export default app;

// Local dev entrypoint (Vercel uses api/[[...route]].ts in Phase 1+).
if (process.env.NODE_ENV !== "production") {
  const { serve } = await import("@hono/node-server");
  const port = Number(process.env.API_PORT ?? 8787);
  serve({ fetch: app.fetch, port });
  console.log(`keyhole api listening on :${port}`);
}
