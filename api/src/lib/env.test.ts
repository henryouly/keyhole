import { describe, expect, it } from "vitest";
import { env } from "./env.js";

describe("vitest env isolation", () => {
  it("always uses the dummy test DATABASE_URL regardless of shell env", () => {
    expect(env.DATABASE_URL).toBe("postgresql://test:test@localhost:1/test");
  });

  it("uses deterministic test defaults for limits and secrets", () => {
    expect(env.API_KEY_DAILY_LIMIT).toBe(2000);
    expect(env.ADMIN_EMAILS).toBe("admin@example.com");
  });
});
