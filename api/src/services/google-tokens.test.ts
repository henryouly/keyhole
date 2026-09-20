import { describe, expect, it, vi } from "vitest";
import { decryptToken, encryptToken } from "../lib/crypto.js";
import {
  createTokenService,
  type StoredTokens,
} from "./google-tokens.js";

function stored(access: string, expiresAt: Date | null): StoredTokens {
  return {
    accessEnc: encryptToken(access),
    refreshEnc: encryptToken("refresh-token"),
    expiresAt,
  };
}

describe("token service", () => {
  it("returns cached token without refreshing", async () => {
    const refresher = vi.fn();
    const svc = createTokenService(
      { load: async () => stored("cached", new Date(Date.now() + 3600_000)), save: async () => {} },
      refresher,
    );
    await expect(svc.getAccessToken("u1")).resolves.toBe("cached");
    expect(refresher).not.toHaveBeenCalled();
  });

  it("throws NOT_CONNECTED when no row", async () => {
    const svc = createTokenService(
      { load: async () => null, save: async () => {} },
      async () => {
        throw new Error("must not refresh");
      },
    );
    await expect(svc.getAccessToken("u1")).rejects.toThrow("NOT_CONNECTED");
  });

  it("refreshes expired tokens and saves the new pair", async () => {
    let saved: StoredTokens | null = null;
    const svc = createTokenService(
      {
        load: async () => stored("old", new Date(Date.now() - 1000)),
        save: async (_u, t) => {
          saved = t;
        },
      },
      async () => ({
        accessToken: "fresh",
        expiresAtMs: Date.now() + 3600_000,
        refreshToken: "rotated",
      }),
    );
    await expect(svc.getAccessToken("u1")).resolves.toBe("fresh");
    expect(saved).not.toBeNull();
    expect(decryptToken(saved!.accessEnc)).toBe("fresh");
    expect(decryptToken(saved!.refreshEnc)).toBe("rotated");
  });

  it("shares one refresh across concurrent callers (single-flight)", async () => {
    let calls = 0;
    const svc = createTokenService(
      {
        load: async () => stored("old", null), // unknown expiry → refresh
        save: async () => {},
      },
      async () => {
        calls++;
        await new Promise((r) => setTimeout(r, 20));
        return { accessToken: "fresh", expiresAtMs: null, refreshToken: null };
      },
    );
    const results = await Promise.all(
      Array.from({ length: 5 }, () => svc.getAccessToken("u1")),
    );
    expect(results).toEqual(["fresh", "fresh", "fresh", "fresh", "fresh"]);
    expect(calls).toBe(1);
  });

  it("propagates refresh errors and retries next call", async () => {
    let calls = 0;
    const svc = createTokenService(
      {
        load: async () => stored("old", null),
        save: async () => {},
      },
      async () => {
        calls++;
        throw new Error("REFRESH_FAILED");
      },
    );
    await expect(svc.getAccessToken("u1")).rejects.toThrow("REFRESH_FAILED");
    await expect(svc.getAccessToken("u1")).rejects.toThrow("REFRESH_FAILED");
    expect(calls).toBe(2);
  });
});
