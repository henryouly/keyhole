import { decryptToken, encryptToken } from "../lib/crypto.js";

export interface StoredTokens {
  accessEnc: string;
  refreshEnc: string;
  expiresAt: Date | null;
}

export interface TokenStore {
  load(userId: string): Promise<StoredTokens | null>;
  save(userId: string, tokens: StoredTokens): Promise<void>;
}

export interface RefreshResult {
  accessToken: string;
  expiresAtMs: number | null;
  /** Set when Google rotates the refresh token. */
  refreshToken: string | null;
}

/**
 * Single-flight access-token provider. Returns the cached token while valid;
 * concurrent callers during a refresh share one upstream refresh call.
 * Production wiring (Drizzle store + google.ts refresher) happens at the call
 * site; tests inject fakes.
 */
export function createTokenService(
  store: TokenStore,
  refresher: (refreshToken: string) => Promise<RefreshResult>,
  opts?: { skewMs?: number },
) {
  const SKEW_MS = opts?.skewMs ?? 60_000;
  const inflight = new Map<string, Promise<string>>();

  async function getAccessToken(
    userId: string,
    nowMs: number = Date.now(),
  ): Promise<string> {
    const stored = await store.load(userId);
    if (!stored) throw new Error("NOT_CONNECTED");
    if (stored.expiresAt && stored.expiresAt.getTime() - nowMs > SKEW_MS) {
      return decryptToken(stored.accessEnc);
    }
    let pending = inflight.get(userId);
    if (!pending) {
      pending = (async () => {
        const fresh = await refresher(decryptToken(stored.refreshEnc));
        await store.save(userId, {
          accessEnc: encryptToken(fresh.accessToken),
          refreshEnc: fresh.refreshToken
            ? encryptToken(fresh.refreshToken)
            : stored.refreshEnc,
          expiresAt: fresh.expiresAtMs ? new Date(fresh.expiresAtMs) : null,
        });
        return fresh.accessToken;
      })();
      inflight.set(userId, pending);
      // Clear on settle. Separate handlers (not .finally) so no stray
      // rejected promise is left unhandled.
      pending.then(
        () => inflight.delete(userId),
        () => inflight.delete(userId),
      );
    }
    return pending;
  }

  return { getAccessToken };
}
