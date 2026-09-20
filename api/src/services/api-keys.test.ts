import { describe, expect, it } from "vitest";
import {
  createKeyService,
  type ApiKeyRow,
  type KeyStore,
} from "./api-keys.js";
import { hashKey, KEY_PREFIX } from "../lib/keys.js";

function memoryStore(): KeyStore & { rows: Map<string, ApiKeyRow> } {
  const rows = new Map<string, ApiKeyRow>();
  return {
    rows,
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

describe("key minting", () => {
  it("mints a verifiable key, storing only the hash", async () => {
    const store = memoryStore();
    const svc = createKeyService(store);
    const { fullKey, prefix } = await svc.mint("u1", {
      name: "openclaw",
      scopes: ["calendar:read"],
      expiresAt: null,
    });
    expect(fullKey.startsWith(KEY_PREFIX)).toBe(true);
    const [row] = [...store.rows.values()];
    expect(row.hash).toBe(hashKey(fullKey));
    expect(row.hash).not.toContain(fullKey.slice(-8));
    expect(row.prefix).toBe(prefix);
    const out = await svc.verify(fullKey);
    expect(out.ok).toBe(true);
  });

  it("rejects empty name and bad scopes", async () => {
    const svc = createKeyService(memoryStore());
    await expect(
      svc.mint("u1", { name: "  ", scopes: ["calendar:read"], expiresAt: null }),
    ).rejects.toThrow("NAME_REQUIRED");
    await expect(
      svc.mint("u1", { name: "x", scopes: [], expiresAt: null }),
    ).rejects.toThrow("INVALID_SCOPES");
    await expect(
      svc.mint("u1", { name: "x", scopes: ["admin:all"], expiresAt: null }),
    ).rejects.toThrow("INVALID_SCOPES");
  });
});

describe("key verification", () => {
  it("rejects unknown and malformed keys", async () => {
    const svc = createKeyService(memoryStore());
    expect(await svc.verify("Bearer nonsense")).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(await svc.verify(`${KEY_PREFIX}unknown`)).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("rejects revoked keys", async () => {
    const store = memoryStore();
    const svc = createKeyService(store);
    const { id, fullKey } = await svc.mint("u1", {
      name: "x",
      scopes: ["calendar:read"],
      expiresAt: null,
    });
    expect(await store.revoke("u1", id)).toBe(true);
    expect(await svc.verify(fullKey)).toEqual({ ok: false, reason: "revoked" });
  });

  it("revoke is scoped to the owning user", async () => {
    const store = memoryStore();
    const svc = createKeyService(store);
    const { id, fullKey } = await svc.mint("u1", {
      name: "x",
      scopes: ["calendar:read"],
      expiresAt: null,
    });
    expect(await store.revoke("u2", id)).toBe(false);
    expect((await svc.verify(fullKey)).ok).toBe(true);
  });

  it("rejects expired keys", async () => {
    const svc = createKeyService(memoryStore());
    const { fullKey } = await svc.mint("u1", {
      name: "x",
      scopes: ["calendar:read"],
      expiresAt: new Date(Date.now() - 1000),
    });
    expect(await svc.verify(fullKey)).toEqual({ ok: false, reason: "expired" });
  });

  it("enforces the daily limit with retry-after", async () => {
    const svc = createKeyService(memoryStore(), { dailyLimit: 2 });
    const { fullKey } = await svc.mint("u1", {
      name: "x",
      scopes: ["calendar:read"],
      expiresAt: null,
    });
    expect((await svc.verify(fullKey)).ok).toBe(true);
    expect((await svc.verify(fullKey)).ok).toBe(true);
    const third = await svc.verify(fullKey);
    expect(third).toMatchObject({ ok: false, reason: "rate_limited" });
    expect(third.ok === false && third.retryAfterSec).toBeGreaterThan(0);
  });

  it("resets the counter on a new UTC day", async () => {
    const svc = createKeyService(memoryStore(), { dailyLimit: 1 });
    const { fullKey } = await svc.mint("u1", {
      name: "x",
      scopes: ["calendar:read"],
      expiresAt: null,
    });
    expect((await svc.verify(fullKey, Date.UTC(2026, 0, 1, 12))).ok).toBe(true);
    expect((await svc.verify(fullKey, Date.UTC(2026, 0, 1, 13))).ok).toBe(false);
    expect(
      (await svc.verify(fullKey, Date.UTC(2026, 0, 2, 0, 0, 1))).ok,
    ).toBe(true);
  });
});
