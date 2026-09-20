import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { apiKeys } from "../db/app-schema.js";
import { getDb } from "../db/client.js";
import {
  AGENT_SCOPES,
  dayBucket,
  generateKeySecret,
  hashKey,
  isValidScope,
  matchesHash,
  KEY_PREFIX,
  type AgentScope,
} from "../lib/keys.js";

export interface ApiKeyRow {
  id: string;
  userId: string;
  name: string;
  prefix: string;
  hash: string;
  scopes: string[];
  expiresAt: Date | null;
  revokedAt: Date | null;
  dailyCount: number;
  dailyWindow: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
}

export interface KeyStore {
  insert(row: ApiKeyRow): Promise<void>;
  findByHash(hash: string): Promise<ApiKeyRow | null>;
  bumpUsage(id: string, count: number, window: Date, usedAt: Date): Promise<void>;
  revoke(userId: string, id: string): Promise<boolean>;
  list(userId: string): Promise<ApiKeyRow[]>;
}

export type VerifyOutcome =
  | {
      ok: true;
      key: { id: string; userId: string; name: string; prefix: string; scopes: string[] };
    }
  | {
      ok: false;
      reason: "invalid" | "revoked" | "expired" | "rate_limited";
      retryAfterSec?: number;
    };

export function secondsUntilTomorrowUtc(nowMs: number): number {
  const d = new Date(nowMs);
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  return Math.max(1, Math.ceil((next - nowMs) / 1000));
}

export function startOfTodayUtc(nowMs: number): Date {
  const d = new Date(nowMs);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function createKeyService(
  store: KeyStore,
  opts?: { dailyLimit?: number },
) {
  const DAILY_LIMIT = opts?.dailyLimit ?? 2000;

  async function mint(
    userId: string,
    input: { name: string; scopes: string[]; expiresAt: Date | null },
  ): Promise<{ id: string; fullKey: string; prefix: string }> {
    const name = input.name.trim();
    if (!name) throw new Error("NAME_REQUIRED");
    if (input.scopes.length === 0 || !input.scopes.every(isValidScope)) {
      throw new Error("INVALID_SCOPES");
    }
    const { fullKey, prefix } = generateKeySecret();
    const id = randomUUID();
    await store.insert({
      id,
      userId,
      name,
      prefix,
      hash: hashKey(fullKey),
      scopes: [...new Set(input.scopes)],
      expiresAt: input.expiresAt,
      revokedAt: null,
      dailyCount: 0,
      dailyWindow: null,
      lastUsedAt: null,
      createdAt: new Date(),
    });
    return { id, fullKey, prefix };
  }

  async function verify(
    fullKey: string,
    nowMs: number = Date.now(),
  ): Promise<VerifyOutcome> {
    if (!fullKey.startsWith(KEY_PREFIX)) return { ok: false, reason: "invalid" };
    const row = await store.findByHash(hashKey(fullKey));
    if (!row || !matchesHash(fullKey, row.hash)) {
      return { ok: false, reason: "invalid" };
    }
    if (row.revokedAt) return { ok: false, reason: "revoked" };
    if (row.expiresAt && row.expiresAt.getTime() <= nowMs) {
      return { ok: false, reason: "expired" };
    }
    const today = dayBucket(nowMs);
    const sameWindow =
      row.dailyWindow !== null && dayBucket(row.dailyWindow.getTime()) === today;
    const count = sameWindow ? row.dailyCount + 1 : 1;
    if (count > DAILY_LIMIT) {
      return {
        ok: false,
        reason: "rate_limited",
        retryAfterSec: secondsUntilTomorrowUtc(nowMs),
      };
    }
    const now = new Date(nowMs);
    await store.bumpUsage(
      row.id,
      count,
      sameWindow ? (row.dailyWindow as Date) : startOfTodayUtc(nowMs),
      now,
    );
    return {
      ok: true,
      key: { id: row.id, userId: row.userId, name: row.name, prefix: row.prefix, scopes: row.scopes },
    };
  }

  async function listKeys(userId: string): Promise<ApiKeyRow[]> {
    return store.list(userId);
  }

  async function revokeKey(userId: string, id: string): Promise<boolean> {
    return store.revoke(userId, id);
  }

  return { mint, verify, listKeys, revokeKey, dailyLimit: DAILY_LIMIT };
}

/** Production Drizzle-backed store. */
export function drizzleKeyStore(): KeyStore {
  const db = getDb();
  return {
    insert: async (row) => {
      await db.insert(apiKeys).values(row);
    },
    findByHash: async (hash) => {
      const rows = await db
        .select()
        .from(apiKeys)
        .where(eq(apiKeys.hash, hash))
        .limit(1);
      return rows[0] ?? null;
    },
    bumpUsage: async (id, count, window, usedAt) => {
      await db
        .update(apiKeys)
        .set({ dailyCount: count, dailyWindow: window, lastUsedAt: usedAt })
        .where(eq(apiKeys.id, id));
    },
    revoke: async (userId, id) => {
      const rows = await db
        .update(apiKeys)
        .set({ revokedAt: new Date() })
        .where(eq(apiKeys.id, id))
        .returning({ id: apiKeys.id, userId: apiKeys.userId });
      const hit = rows.find((r) => r.userId === userId);
      return hit !== undefined;
    },
    list: async (userId) => {
      return db.select().from(apiKeys).where(eq(apiKeys.userId, userId));
    },
  };
}

export { AGENT_SCOPES };
export type { AgentScope };
