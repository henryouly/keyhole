import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { connectedAccounts } from "../db/app-schema.js";
import { getDb } from "../db/client.js";
import { isAdminEmail } from "../lib/admin.js";
import { auth } from "../lib/auth.js";
import { decryptToken, encryptToken } from "../lib/crypto.js";
import { adminEmails, env } from "../lib/env.js";
import {
  buildAuthUrl,
  exchangeCode,
  PROVIDER_ID,
  revokeRefreshToken,
} from "../lib/google.js";
import {
  isOAuthEnabled,
  newNonce,
  signState,
  verifyState,
} from "../lib/oauth.js";
import { createTokenService } from "../services/google-tokens.js";
import { refreshAccessToken } from "../lib/google.js";

const oauth = new Hono();
const STATE_TTL_MS = 10 * 60 * 1000;

function oauthEnabled(): boolean {
  return isOAuthEnabled(env.APP_URL, env.PROD_APP_URL);
}

function denied(reason: string): Response {
  return Response.redirect(`${env.APP_URL}/?error=${reason}`, 302);
}

/** Admin user id, or null. Never throws. */
async function adminUserId(req: Request): Promise<string | null> {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session || !isAdminEmail(session.user?.email, adminEmails)) {
      return null;
    }
    return session.user.id;
  } catch {
    return null;
  }
}

oauth.get("/google/start", async (c) => {
  if (!oauthEnabled()) return denied("oauth_disabled");
  const userId = await adminUserId(c.req.raw);
  if (!userId) return denied("forbidden");
  const state = signState(env.AUTH_SECRET, newNonce(), Date.now() + STATE_TTL_MS);
  return c.redirect(buildAuthUrl(state), 302);
});

oauth.get("/google/callback", async (c) => {
  if (!oauthEnabled()) return denied("oauth_disabled");
  const googleError = c.req.query("error");
  if (googleError) return denied(`google_${googleError}`);
  const code = c.req.query("code");
  const state = c.req.query("state");
  if (!code || !state) return denied("missing_params");
  try {
    verifyState(env.AUTH_SECRET, state);
  } catch {
    return denied("bad_state");
  }
  const userId = await adminUserId(c.req.raw);
  if (!userId) return denied("forbidden");

  let tokens;
  try {
    tokens = await exchangeCode(code);
  } catch (e) {
    const reason =
      e instanceof Error && e.message.startsWith("NO_REFRESH_TOKEN")
        ? "no_refresh_token"
        : "exchange_failed";
    return denied(reason);
  }

  const db = getDb();
  const row = {
    accessEnc: encryptToken(tokens.accessToken),
    refreshEnc: encryptToken(tokens.refreshToken),
    expiresAt: tokens.expiresAtMs ? new Date(tokens.expiresAtMs) : null,
    scopes: tokens.scope,
    accountEmail: tokens.accountEmail,
    updatedAt: new Date(),
  };
  const existing = await db
    .select({ id: connectedAccounts.id })
    .from(connectedAccounts)
    .where(
      and(
        eq(connectedAccounts.userId, userId),
        eq(connectedAccounts.provider, PROVIDER_ID),
      ),
    )
    .limit(1);
  if (existing.length > 0) {
    await db
      .update(connectedAccounts)
      .set(row)
      .where(eq(connectedAccounts.id, existing[0].id));
  } else {
    await db.insert(connectedAccounts).values({
      id: randomUUID(),
      userId,
      provider: PROVIDER_ID,
      createdAt: new Date(),
      ...row,
    });
  }
  return c.redirect(`${env.APP_URL}/?connected=google-calendar`, 302);
});

/** Production token service: Drizzle store + Google refresh. Phase 4 reuses this. */
export function tokenService() {
  const db = getDb();
  return createTokenService(
    {
      load: async (userId) => {
        const rows = await db
          .select({
            accessEnc: connectedAccounts.accessEnc,
            refreshEnc: connectedAccounts.refreshEnc,
            expiresAt: connectedAccounts.expiresAt,
          })
          .from(connectedAccounts)
          .where(
            and(
              eq(connectedAccounts.userId, userId),
              eq(connectedAccounts.provider, PROVIDER_ID),
            ),
          )
          .limit(1);
        return rows[0] ?? null;
      },
      save: async (userId, tokens) => {
        await db
          .update(connectedAccounts)
          .set({ ...tokens, updatedAt: new Date() })
          .where(
            and(
              eq(connectedAccounts.userId, userId),
              eq(connectedAccounts.provider, PROVIDER_ID),
            ),
          );
      },
    },
    async (refreshToken) => refreshAccessToken(refreshToken),
  );
}

export async function disconnectProvider(userId: string): Promise<void> {
  const db = getDb();
  const rows = await db
    .select({ id: connectedAccounts.id, refreshEnc: connectedAccounts.refreshEnc })
    .from(connectedAccounts)
    .where(
      and(
        eq(connectedAccounts.userId, userId),
        eq(connectedAccounts.provider, PROVIDER_ID),
      ),
    )
    .limit(1);
  if (rows.length === 0) return;
  // Best-effort Google-side revocation; row deletion is the real revoke.
  try {
    await revokeRefreshToken(decryptToken(rows[0].refreshEnc));
  } catch {
    // decrypt needs DATA_ENCRYPTION_KEY; if misconfigured, still delete.
  }
  await db.delete(connectedAccounts).where(eq(connectedAccounts.id, rows[0].id));
}

export default oauth;
