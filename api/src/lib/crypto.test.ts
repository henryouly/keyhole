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
    // Flip a bit in the first char: always a data bit, unlike the last char
    // whose low bits may be base64 padding.
    const tamperedCt = (ct.startsWith("A") ? "B" : "A") + ct.slice(1);
    expect(() => decryptToken(`${iv}.${tag}.${tamperedCt}`)).toThrow();
  });

  it("rejects malformed blobs", () => {
    expect(() => decryptToken("not-a-blob")).toThrow("Malformed");
    expect(() => decryptToken("a.b")).toThrow("Malformed");
  });
});
