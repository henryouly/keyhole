import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Context, Next } from "hono";
import { auditLogs } from "../db/app-schema.js";
import { getDb } from "../db/client.js";
import { env } from "../lib/env.js";
import { hasScope, type AgentScope } from "../lib/keys.js";
import {
  createKeyService,
  drizzleKeyStore,
} from "../services/api-keys.js";

export interface AgentAuth {
  id: string;
  userId: string;
  name: string;
  prefix: string;
  scopes: string[];
}

/** Hono env carrying the verified agent. Use on apps mounting agentAuth. */
export type AgentEnv = { Variables: { agent: AgentAuth } };

export interface AuditEntry {
  userId: string | null;
  apiKeyPrefix: string | null;
  method: string;
  path: string;
  status: number;
  ms: number;
}

const AUDIT_KEEP = 10_000;

type KeyService = ReturnType<typeof createKeyService>;

/** Best-effort: audit + prune. Never throws (must not fail agent requests). */
export async function dbAudit(entry: AuditEntry): Promise<void> {
  try {
    const db = getDb();
    await db.insert(auditLogs).values({
      id: randomUUID(),
      userId: entry.userId,
      apiKeyPrefix: entry.apiKeyPrefix,
      method: entry.method,
      path: entry.path,
      status: entry.status,
      ms: entry.ms,
      createdAt: new Date(),
    });
    await db.execute(sql`
      delete from ${auditLogs} where ${auditLogs.id} not in (
        select ${auditLogs.id} from ${auditLogs}
        order by ${auditLogs.createdAt} desc limit ${AUDIT_KEEP}
      )`);
  } catch {
    // DB down or misconfigured: the agent call itself already succeeded.
  }
}

export function createAgentMiddleware(opts?: {
  keyService?: KeyService;
  recordAudit?: (e: AuditEntry) => Promise<void>;
  dailyLimit?: number;
}) {
  const service =
    opts?.keyService ??
    createKeyService(drizzleKeyStore(), {
      dailyLimit: opts?.dailyLimit ?? env.API_KEY_DAILY_LIMIT,
    });
  const recordAudit = opts?.recordAudit ?? dbAudit;

  return async function agentAuth(c: Context<AgentEnv>, next: Next) {
    const started = Date.now();
    const path = c.req.path;
    const method = c.req.method;
    const fail = async (
      status: 401 | 403 | 429,
      error: string,
      message: string,
      retryAfterSec?: number,
    ) => {
      if (retryAfterSec !== undefined) {
        c.header("Retry-After", String(retryAfterSec));
      }
      await recordAudit({
        userId: null,
        apiKeyPrefix: null,
        method,
        path,
        status,
        ms: Date.now() - started,
      });
      return c.json({ error, message }, status);
    };

    const header = c.req.header("authorization") ?? "";
    const match = /^Bearer\s+(.+)$/.exec(header.trim());
    if (!match) {
      return fail(
        401,
        "missing_key",
        "Provide an API key as: Authorization: Bearer kh_live_...",
      );
    }
    const outcome = await service.verify(match[1]);
    if (!outcome.ok) {
      if (outcome.reason === "rate_limited") {
        return fail(
          429,
          "rate_limited",
          "Daily key quota exceeded. Mint a fresh key or wait.",
          outcome.retryAfterSec,
        );
      }
      const messages = {
        invalid: "Unknown API key.",
        revoked: "This API key was revoked.",
        expired: "This API key expired.",
      } as const;
      return fail(401, outcome.reason, messages[outcome.reason]);
    }
    c.set("agent", {
      id: outcome.key.id,
      userId: outcome.key.userId,
      name: outcome.key.name,
      prefix: outcome.key.prefix,
      scopes: outcome.key.scopes,
    } satisfies AgentAuth);
    await next();
    await recordAudit({
      userId: outcome.key.userId,
      apiKeyPrefix: outcome.key.prefix,
      method,
      path,
      status: c.res.status,
      ms: Date.now() - started,
    });
  };
}

/** 403 unless the verified key carries the needed scope. */
export function requireAgentScope(needed: AgentScope) {
  return async function scopeGate(c: Context<AgentEnv>, next: Next) {
    const agent = c.get("agent");
    if (!agent || !hasScope(agent.scopes, needed)) {
      return c.json(
        {
          error: "forbidden_scope",
          message: `This key lacks the ${needed} scope.`,
        },
        403,
      );
    }
    await next();
  };
}
