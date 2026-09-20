import { describe, expect, it } from "vitest";
import {
  createEventBody,
  deleteEventQuery,
  listEventsQuery,
} from "./calendar.js";

const DAY = "2026-09-20T00:00:00Z";
const PLUS_30D = "2026-10-20T00:00:00Z";
const PLUS_91D = "2026-12-20T00:00:01Z";

describe("listEventsQuery", () => {
  it("accepts a valid window with defaults", () => {
    const out = listEventsQuery.parse({ timeMin: DAY, timeMax: PLUS_30D });
    expect(out.maxResults).toBe(25);
    expect(out.q).toBeUndefined();
  });

  it("rejects windows over 90 days and inverted ranges", () => {
    expect(
      listEventsQuery.safeParse({ timeMin: DAY, timeMax: PLUS_91D }).success,
    ).toBe(false);
    expect(
      listEventsQuery.safeParse({ timeMin: PLUS_30D, timeMax: DAY }).success,
    ).toBe(false);
  });

  it("coerces and clamps maxResults", () => {
    expect(
      listEventsQuery.parse({ timeMin: DAY, timeMax: PLUS_30D, maxResults: "50" })
        .maxResults,
    ).toBe(50);
    expect(
      listEventsQuery.safeParse({ timeMin: DAY, timeMax: PLUS_30D, maxResults: 500 })
        .success,
    ).toBe(false);
  });
});

describe("createEventBody", () => {
  const base = {
    summary: "Standup",
    start: { dateTime: DAY },
    end: { dateTime: "2026-09-20T00:30:00Z" },
  };
  it("accepts minimal + idempotency key", () => {
    const out = createEventBody.parse({ ...base, idempotencyKey: "abc-123" });
    expect(out.idempotencyKey).toBe("abc-123");
  });
  it("rejects missing summary and bad attendees", () => {
    expect(
      createEventBody.safeParse({ ...base, summary: "" }).success,
    ).toBe(false);
    expect(
      createEventBody.safeParse({ ...base, attendees: ["not-an-email"] }).success,
    ).toBe(false);
  });
});

describe("deleteEventQuery", () => {
  it("defaults to trash (confirm false)", () => {
    expect(deleteEventQuery.parse({ calendarId: "primary" }).confirm).toBe(false);
    expect(
      deleteEventQuery.parse({ calendarId: "primary", confirm: "true" }).confirm,
    ).toBe(true);
  });
});
