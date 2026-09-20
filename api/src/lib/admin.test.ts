import { describe, expect, it } from "vitest";
import { decideUserCreate, isAdminEmail, normalizeEmail } from "./admin.js";

const allowlist = new Set(["you@gmail.com"]);

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  You@Gmail.COM ")).toBe("you@gmail.com");
  });
});

describe("isAdminEmail", () => {
  it("allows exact allowlisted email", () => {
    expect(isAdminEmail("you@gmail.com", allowlist)).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isAdminEmail("YOU@GMAIL.COM", allowlist)).toBe(true);
  });

  it("blocks non-allowlisted email", () => {
    expect(isAdminEmail("attacker@gmail.com", allowlist)).toBe(false);
  });

  it("blocks null, undefined, and empty", () => {
    expect(isAdminEmail(null, allowlist)).toBe(false);
    expect(isAdminEmail(undefined, allowlist)).toBe(false);
    expect(isAdminEmail("   ", allowlist)).toBe(false);
  });

  it("blocks everyone when the allowlist is empty", () => {
    expect(isAdminEmail("you@gmail.com", new Set())).toBe(false);
  });
});

describe("decideUserCreate", () => {
  it("permits allowlisted signup (user row may be created)", () => {
    expect(decideUserCreate("you@gmail.com", allowlist)).toBe(true);
  });

  it("denies non-allowlisted signup (no user row, no session)", () => {
    expect(decideUserCreate("attacker@gmail.com", allowlist)).toBe(false);
  });
});
