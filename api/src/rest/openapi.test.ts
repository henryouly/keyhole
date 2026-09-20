import { describe, expect, it } from "vitest";
import v1 from "./v1.js";
import { buildOpenApi } from "./openapi.js";

const doc = buildOpenApi("http://localhost:8787") as {
  openapi: string;
  security: unknown;
  components: { securitySchemes: { keyholeKey: { scheme: string } } };
  paths: Record<string, Record<string, unknown>>;
};

describe("openapi document", () => {
  it("is a bearer-secured 3.1 document with the expected routes", () => {
    expect(doc.openapi).toBe("3.1.0");
    expect(doc.security).toEqual([{ keyholeKey: [] }]);
    expect(doc.components.securitySchemes.keyholeKey.scheme).toBe("bearer");
    expect(Object.keys(doc.paths).sort()).toEqual([
      "/calendars",
      "/calendars/{calendarId}/events",
      "/events/{eventId}",
      "/ping",
    ]);
    const methods = (p: string) => Object.keys(doc.paths[p]).sort();
    expect(methods("/ping")).toEqual(["get"]);
    expect(methods("/calendars")).toEqual(["get"]);
    expect(methods("/calendars/{calendarId}/events")).toEqual(["get", "post"]);
    expect(methods("/events/{eventId}")).toEqual(["delete", "get", "patch"]);
  });
});

describe("spec↔routes conformance", () => {
  it("every documented route+method answers 401 (not 404) unauthenticated", async () => {
    for (const [path, methods] of Object.entries(doc.paths)) {
      const concrete = `/api/v1${path}`
        .replace("{calendarId}", "x")
        .replace("{eventId}", "x");
      for (const method of Object.keys(methods)) {
        const res = await v1.request(concrete, { method });
        expect(res.status, `${method} ${concrete}`).toBe(401);
      }
    }
  });
});
