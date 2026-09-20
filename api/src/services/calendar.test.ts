import { describe, expect, it, vi } from "vitest";
import {
  CalendarHttpError,
  mapGoogleError,
  normalizeEvent,
  runWithCalendar,
  type CalendarBackend,
} from "./calendar.js";

function gaxiosError(code: number, message = "boom", headers = {}) {
  const e = new Error(message) as Error & {
    code: number;
    response: { headers: Record<string, string> };
  };
  e.code = code;
  e.response = { headers };
  return e;
}

describe("normalizeEvent", () => {
  it("maps a full Google event", () => {
    const out = normalizeEvent("primary", {
      id: "e1",
      status: "confirmed",
      summary: "Lunch",
      description: "tacos",
      location: "cafe",
      start: { dateTime: "2026-09-20T12:00:00Z", timeZone: "UTC" },
      end: { dateTime: "2026-09-20T13:00:00Z" },
      updated: "2026-09-19T00:00:00Z",
    });
    expect(out).toMatchObject({
      id: "e1",
      calendarId: "primary",
      summary: "Lunch",
      start: { dateTime: "2026-09-20T12:00:00Z", timeZone: "UTC" },
    });
  });

  it("defaults missing summary, throws on missing id", () => {
    expect(normalizeEvent("c", { id: "x" }).summary).toBe("(no title)");
    expect(() => normalizeEvent("c", {})).toThrowError(CalendarHttpError);
  });
});

describe("mapGoogleError", () => {
  it("marks 401 retryable", () => {
    const m = mapGoogleError(gaxiosError(401));
    expect(m).toMatchObject({ status: 401, retryableAuth: true });
  });
  it.each([
    [404, 404, "not_found"],
    [410, 404, "not_found"],
    [400, 400, "bad_request"],
    [403, 403, "google_forbidden"],
    [500, 502, "google_unavailable"],
  ])("maps %i → %i %s", (code, status, expected) => {
    expect(mapGoogleError(gaxiosError(code))).toMatchObject({ status, code: expected });
  });
  it("maps 429 with retry-after", () => {
    const m = mapGoogleError(gaxiosError(429, "slow", { "retry-after": "30" }));
    expect(m).toMatchObject({ status: 429, code: "google_rate_limited", retryAfterSec: 30 });
  });
  it("maps unknown errors to 502", () => {
    expect(mapGoogleError(new Error("weird"))).toMatchObject({
      status: 502,
      code: "google_error",
    });
  });
});

describe("runWithCalendar", () => {
  const backend: CalendarBackend = {} as CalendarBackend;

  it("passes through success without refreshing", async () => {
    const tokens = { getAccessToken: vi.fn(async () => "tok"), refreshNow: vi.fn() };
    const out = await runWithCalendar(tokens, "u", async () => "done", () => backend);
    expect(out).toBe("done");
    expect(tokens.refreshNow).not.toHaveBeenCalled();
  });

  it("refreshes once and retries after a 401", async () => {
    let calls = 0;
    const tokens = {
      getAccessToken: async () => "stale",
      refreshNow: vi.fn(async () => "fresh"),
    };
    const out = await runWithCalendar(
      tokens,
      "u",
      async () => {
        calls++;
        if (calls === 1) throw gaxiosError(401);
        return "recovered";
      },
      () => backend,
    );
    expect(out).toBe("recovered");
    expect(tokens.refreshNow).toHaveBeenCalledTimes(1);
  });

  it("gives 502 google_auth_failed on double 401", async () => {
    const tokens = { getAccessToken: async () => "dead", refreshNow: async () => "dead2" };
    const err = await runWithCalendar(tokens, "u", async () => {
      throw gaxiosError(401);
    }).catch((e) => e);
    expect(err).toBeInstanceOf(CalendarHttpError);
    expect(err).toMatchObject({ status: 502, code: "google_auth_failed" });
  });

  it("does not refresh on non-auth errors", async () => {
    const tokens = { getAccessToken: async () => "tok", refreshNow: vi.fn() };
    const err = await runWithCalendar(tokens, "u", async () => {
      throw gaxiosError(404);
    }).catch((e) => e);
    expect(err).toMatchObject({ status: 404 });
    expect(tokens.refreshNow).not.toHaveBeenCalled();
  });
});
