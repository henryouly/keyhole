import { describe, expect, it } from "vitest";
import { isOAuthEnabled, signState, verifyState } from "./oauth.js";

const SECRET = "test-auth-secret";
const NONCE = "test-nonce";

describe("oauth state", () => {
  it("round-trips", () => {
    const state = signState(SECRET, NONCE, Date.now() + 60_000);
    expect(verifyState(SECRET, state)).toBe(NONCE);
  });

  it("rejects wrong secret", () => {
    const state = signState(SECRET, NONCE, Date.now() + 60_000);
    expect(() => verifyState("other-secret", state)).toThrow("signature");
  });

  it("rejects expired state", () => {
    const state = signState(SECRET, NONCE, Date.now() - 1000);
    expect(() => verifyState(SECRET, state)).toThrow("Expired");
  });

  it("rejects tampered payload", () => {
    const state = signState(SECRET, NONCE, Date.now() + 60_000);
    const [, sig] = state.split(".");
    const tampered = Buffer.from(
      JSON.stringify({ n: "evil", e: Date.now() + 60_000 }),
    )
      .toString("base64url");
    expect(() => verifyState(SECRET, `${tampered}.${sig}`)).toThrow(
      "signature",
    );
  });

  it("rejects malformed state", () => {
    expect(() => verifyState(SECRET, "no-dot")).toThrow("Malformed");
  });
});

describe("isOAuthEnabled", () => {
  it("allows localhost dev", () => {
    expect(isOAuthEnabled("http://localhost:5173", "")).toBe(true);
    expect(isOAuthEnabled("http://localhost:8787/", "")).toBe(true);
  });

  it("allows the canonical prod URL only when configured", () => {
    expect(
      isOAuthEnabled("https://keyhole.vercel.app", "https://keyhole.vercel.app"),
    ).toBe(true);
  });

  it("blocks preview deploys and unset prod", () => {
    expect(isOAuthEnabled("https://keyhole-abc.vercel.app", "")).toBe(false);
    expect(
      isOAuthEnabled(
        "https://keyhole-abc.vercel.app",
        "https://keyhole.vercel.app",
      ),
    ).toBe(false);
    expect(isOAuthEnabled("https://keyhole.vercel.app", "")).toBe(false);
  });
});
