import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import {
  createAgentMiddleware,
  requireAgentScope,
  type AgentEnv,
  type AuditEntry,
} from "./agent-auth.js";
import { createKeyService } from "../services/api-keys.js";
import type { ApiKeyRow, KeyStore } from "../services/api-keys.js";

function memoryStore(): KeyStore {
  const rows = new Map<string, ApiKeyRow>();
  return {
    insert: async (r) => {
      rows.set(r.id, r);
    },
    findByHash: async (h) => {
      for (const r of rows.values()) if (r.hash === h) return r;
      return null;
    },
    bumpUsage: async (id, count, window, usedAt) => {
      const r = rows.get(id)!;
      rows.set(id, { ...r, dailyCount: count, dailyWindow: window, lastUsedAt: usedAt });
    },
    revoke: async (userId, id) => {
      const r = rows.get(id);
      if (!r || r.userId !== userId) return false;
      rows.set(id, { ...r, revokedAt: new Date() });
      return true;
    },
    list: async (userId) => [...rows.values()].filter((r) => r.userId === userId),
  };
}

async function testApp(opts?: { dailyLimit?: number }) {
  const store = memoryStore();
  const service = createKeyService(store, { dailyLimit: opts?.dailyLimit ?? 2000 });
  const audits: AuditEntry[] = [];
  const recordAudit = vi.fn(async (e: AuditEntry) => {
    audits.push(e);
  });
  const app = new Hono<AgentEnv>();
  app.use("/*", createAgentMiddleware({ keyService: service, recordAudit }));
  app.get("/read-thing", requireAgentScope("calendar:read"), (c) =>
    c.json({ ok: true }),
  );
  app.post("/write-thing", requireAgentScope("calendar:write"), (c) =>
    c.json({ ok: true }),
  );
  const read = await service.mint("u1", {
    name: "reader",
    scopes: ["calendar:read"],
    expiresAt: null,
  });
  const write = await service.mint("u1", {
    name: "writer",
    scopes: ["calendar:read", "calendar:write"],
    expiresAt: null,
  });
  const expired = await service.mint("u1", {
    name: "old",
    scopes: ["calendar:read"],
    expiresAt: new Date(Date.now() - 1000),
  });
  return { app, audits, read, write, expired, store };
}

describe("agent auth matrix", () => {
  it("401 without or with bad credentials", async () => {
    const { app } = await testApp();
    let res = await app.request("/read-thing");
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "missing_key" });
    res = await app.request("/read-thing", {
      headers: { authorization: "Bearer kh_live_nope" },
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "invalid" });
  });

  it("401 for expired keys", async () => {
    const { app, expired } = await testApp();
    const res = await app.request("/read-thing", {
      headers: { authorization: `Bearer ${expired.fullKey}` },
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "expired" });
  });

  it("200 with the right scope, 403 without", async () => {
    const { app, read, write } = await testApp();
    const auth = (k: string) => ({ authorization: `Bearer ${k}` });
    let res = await app.request("/read-thing", { headers: auth(read.fullKey) });
    expect(res.status).toBe(200);
    res = await app.request("/write-thing", {
      method: "POST",
      headers: auth(read.fullKey),
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "forbidden_scope" });
    res = await app.request("/write-thing", {
      method: "POST",
      headers: auth(write.fullKey),
    });
    expect(res.status).toBe(200);
  });

  it("429 with Retry-After past the daily limit", async () => {
    const { app, read } = await testApp({ dailyLimit: 1 });
    const headers = { authorization: `Bearer ${read.fullKey}` };
    expect((await app.request("/read-thing", { headers })).status).toBe(200);
    const res = await app.request("/read-thing", { headers });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
    expect(await res.json()).toMatchObject({ error: "rate_limited" });
  });

  it("audits successes and failures", async () => {
    const { app, audits, read } = await testApp();
    await app.request("/read-thing");
    await app.request("/read-thing", {
      headers: { authorization: `Bearer ${read.fullKey}` },
    });
    expect(audits.map((a) => a.status)).toEqual([401, 200]);
    expect(audits[1]).toMatchObject({
      userId: "u1",
      method: "GET",
      path: "/read-thing",
    });
    expect(audits[0].apiKeyPrefix).toBeNull();
  });
});
