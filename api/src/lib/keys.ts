import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const KEY_PREFIX = "kh_live_";
export const AGENT_SCOPES = ["calendar:read", "calendar:write"] as const;
export type AgentScope = (typeof AGENT_SCOPES)[number];

export const DEFAULT_KEY_EXPIRY_DAYS = 90;

/** Fresh secret. Shown once at creation, never stored (only its hash). */
export function generateKeySecret(): { fullKey: string; prefix: string } {
  const random = randomBytes(32).toString("base64url");
  return { fullKey: `${KEY_PREFIX}${random}`, prefix: `${KEY_PREFIX}${random.slice(0, 12)}` };
}

export function hashKey(fullKey: string): string {
  return createHash("sha256").update(fullKey, "utf8").digest("hex");
}

/** Constant-time comparison of a presented key against a stored hash. */
export function matchesHash(fullKey: string, storedHashHex: string): boolean {
  const candidate = Buffer.from(hashKey(fullKey), "hex");
  let stored: Buffer;
  try {
    stored = Buffer.from(storedHashHex, "hex");
  } catch {
    return false;
  }
  if (stored.length !== candidate.length) return false;
  return timingSafeEqual(stored, candidate);
}

export function isValidScope(s: string): s is AgentScope {
  return (AGENT_SCOPES as readonly string[]).includes(s);
}

/** Write operations require calendar:write. Everything else needs calendar:read. */
export function hasScope(granted: string[], needed: AgentScope): boolean {
  return granted.includes(needed);
}

/** UTC day bucket, e.g. "2026-09-20", for the daily counter window. */
export function dayBucket(nowMs: number = Date.now()): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}
