import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * CSRF state for the data-connect OAuth flow. Stateless: the nonce, expiry,
 * and HMAC (keyed by AUTH_SECRET) travel in the `state` param itself, so no
 * server-side storage is needed (serverless-friendly).
 */
export function newNonce(): string {
  return randomBytes(16).toString("base64url");
}

export function signState(
  secret: string,
  nonce: string,
  expiresAtMs: number,
): string {
  const payload = Buffer.from(
    JSON.stringify({ n: nonce, e: expiresAtMs }),
    "utf8",
  ).toString("base64url");
  const sig = createHmac("sha256", secret).update(payload).digest();
  return `${payload}.${sig.toString("base64url")}`;
}

/** Returns the nonce. Throws on bad signature, expiry, or shape. */
export function verifyState(
  secret: string,
  state: string,
  nowMs: number = Date.now(),
): string {
  const [payloadB64, sigB64] = state.split(".");
  if (!payloadB64 || !sigB64) throw new Error("Malformed state");
  const expected = createHmac("sha256", secret).update(payloadB64).digest();
  const actual = Buffer.from(sigB64, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new Error("Bad state signature");
  }
  const { n, e } = JSON.parse(
    Buffer.from(payloadB64, "base64url").toString("utf8"),
  ) as { n: unknown; e: unknown };
  if (typeof n !== "string" || typeof e !== "number" || e <= nowMs) {
    throw new Error("Expired or invalid state");
  }
  return n;
}

/**
 * Preview-deploy kill switch (locked decision): OAuth is enabled on localhost
 * (dev) and on the canonical prod URL only. Any other APP_URL (e.g. Vercel
 * preview deploys) gets a redirect to ?error=oauth_disabled.
 */
export function isOAuthEnabled(appUrl: string, prodUrl: string): boolean {
  if (/^http:\/\/localhost(:\d+)?(\/|$)/.test(appUrl)) return true;
  return prodUrl !== "" && appUrl === prodUrl;
}
