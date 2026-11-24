import { describe, expect, it } from "vitest";
import app from "../index.js";
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
  it("documented routes+methods match registered v1 routes bidirectionally", () => {
    const documented = new Set<string>();
    for (const [path, methods] of Object.entries(doc.paths)) {
      const honoPath = path.replace(/\{([^}]+)\}/g, ":$1");
      for (const method of Object.keys(methods)) {
        documented.add(`${method.toUpperCase()} ${honoPath}`);
      }
    }

    const registered = new Set(
      v1.routes
        .filter((r) => r.method !== "ALL")
        .map((r) => `${r.method.toUpperCase()} ${r.path}`),
    );

    expect([...registered].sort()).toEqual([...documented].sort());
  });

  it("every documented route+method on mounted app answers 401 unauthenticated", async () => {
    for (const [path, methods] of Object.entries(doc.paths)) {
      const concrete = `/api/v1${path}`
        .replace("{calendarId}", "x")
        .replace("{eventId}", "x");
      for (const method of Object.keys(methods)) {
        const upper = method.toUpperCase();
        const res = await app.request(concrete, { method: upper });
        expect(res.status, `${upper} ${concrete}`).toBe(401);
      }
    }

    // Sanity check: mounted app itself does not blanket-401 unknown paths.
    const unknown = await app.request("/api/does-not-exist", { method: "GET" });
    expect(unknown.status).toBe(404);
  });
});
