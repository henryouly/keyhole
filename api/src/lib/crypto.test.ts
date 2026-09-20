import { describe, expect, it } from "vitest";
import { decryptToken, encryptToken } from "./crypto.js";

const SAMPLE = "ya29.sample-refresh-token-value";

describe("token crypto", () => {
  it("round-trips", () => {
    expect(decryptToken(encryptToken(SAMPLE))).toBe(SAMPLE);
  });

  it("produces distinct blobs (random IV)", () => {
    expect(encryptToken(SAMPLE)).not.toBe(encryptToken(SAMPLE));
  });

  it("rejects tampered blobs", () => {
    const blob = encryptToken(SAMPLE);
    const [iv, tag, ct] = blob.split(".");
    const tamperedCt =
      ct.slice(0, -1) + (ct.endsWith("A") ? "B" : "A");
    expect(() => decryptToken(`${iv}.${tag}.${tamperedCt}`)).toThrow();
  });

  it("rejects malformed blobs", () => {
    expect(() => decryptToken("not-a-blob")).toThrow("Malformed");
    expect(() => decryptToken("a.b")).toThrow("Malformed");
  });
});
