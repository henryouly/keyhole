import { z } from "zod";
import {
  createEventBody,
  deleteEventQuery,
  getEventQuery,
  listEventsQuery,
  updateEventBody,
} from "../schemas/calendar.js";

/**
 * Hand-assembled OpenAPI 3.1 document. Request bodies and query shapes are
 * generated from the same Zod schemas that validate traffic (z.toJSONSchema),
 * so input docs cannot drift. Response shapes are stable hand-written
 * components mirroring NormalizedEvent / CalendarListEntry.
 *
 * Conformance is enforced by openapi.test.ts: every documented path must
 * answer 401 (not 404) unauthenticated, proving the route exists behind the
 * agent gate.
 */
function qparams(schema: z.ZodTypeAny): unknown[] {
  const json = z.toJSONSchema(schema) as {
    properties?: Record<string, unknown>;
    required?: string[];
  };
  return Object.entries(json.properties ?? {}).map(([name, def]) => ({
    name,
    in: "query",
    required: (json.required ?? []).includes(name),
    schema: def,
  }));
}

const CalendarListEntry = {
  type: "object",
  required: ["id", "summary", "timeZone", "primary", "accessRole"],
  properties: {
    id: { type: "string", example: "primary" },
    summary: { type: "string" },
    timeZone: { type: ["string", "null"] },
    primary: { type: "boolean" },
    accessRole: { type: ["string", "null"], example: "owner" },
  },
};

const NormalizedEvent = {
  type: "object",
  required: ["id", "calendarId", "summary", "start", "end"],
  properties: {
    id: { type: "string" },
    calendarId: { type: "string" },
    status: { type: ["string", "null"], example: "confirmed" },
    summary: { type: "string" },
    description: { type: ["string", "null"] },
    location: { type: ["string", "null"] },
    start: {
      type: "object",
      properties: {
        dateTime: { type: ["string", "null"], format: "date-time" },
        timeZone: { type: ["string", "null"] },
      },
    },
    end: {
      type: "object",
      properties: {
        dateTime: { type: ["string", "null"], format: "date-time" },
        timeZone: { type: ["string", "null"] },
      },
    },
    updated: { type: ["string", "null"], format: "date-time" },
  },
};

const AgentError = {
  type: "object",
  required: ["error", "message"],
  properties: {
    error: {
      type: "string",
      example: "forbidden_scope",
      enum: [
        "missing_key",
        "invalid",
        "revoked",
        "expired",
        "rate_limited",
        "forbidden_scope",
        "bad_request",
        "not_found",
        "google_forbidden",
        "google_rate_limited",
        "google_unavailable",
        "google_auth_failed",
        "google_error",
      ],
    },
    message: { type: "string" },
  },
};

const calendarIdParam = {
  name: "calendarId",
  in: "path",
  required: true,
  schema: { type: "string" },
  description: "Calendar ID (URL-encode it). `primary` works for the main calendar.",
};

const eventIdParam = {
  name: "eventId",
  in: "path",
  required: true,
  schema: { type: "string" },
};

const readScope = "Requires the key to carry `calendar:read`.";
const writeScope = "Requires the key to carry `calendar:write`.";

function errResp(description: string) {
  return {
    description,
    content: {
      "application/json": { schema: { $ref: "#/components/schemas/AgentError" } },
    },
  };
}

export function buildOpenApi(baseUrl: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "Keyhole Calendar API",
      version: "1",
      description:
        "Agent-facing Google Calendar bridge. Authenticate every request with " +
        "`Authorization: Bearer kh_live_...`. Keys are scoped per key " +
        "(`calendar:read`, `calendar:write`) and expire. See /skill.md for the agent guide.",
    },
    servers: [{ url: `${baseUrl}/api/v1` }],
    security: [{ keyholeKey: [] }],
    components: {
      securitySchemes: {
        keyholeKey: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "kh_live_...",
          description: "Scoped agent key minted in the Keyhole dashboard.",
        },
      },
      schemas: { CalendarListEntry, NormalizedEvent, AgentError },
    },
    paths: {
      "/ping": {
        get: {
          summary: "Connectivity probe",
          description: `${readScope} Returns the calling key's prefix and scopes.`,
          responses: {
            "200": {
              description: "Key is valid",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok: { type: "boolean" },
                      key: { type: "string" },
                      scopes: { type: "array", items: { type: "string" } },
                    },
                  },
                },
              },
            },
            "401": errResp("Bad/missing/expired/revoked key"),
          },
        },
      },
      "/calendars": {
        get: {
          summary: "List calendars",
          description: readScope,
          responses: {
            "200": {
              description: "Calendars",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      items: {
                        type: "array",
                        items: { $ref: "#/components/schemas/CalendarListEntry" },
                      },
                    },
                  },
                },
              },
            },
            "401": errResp("Auth failure"),
          },
        },
      },
      "/calendars/{calendarId}/events": {
        get: {
          summary: "List events in a window",
          description:
            `${readScope} timeMin/timeMax are required, UTC ISO, max 90-day span. ` +
            "Results use singleEvents with startTime ordering.",
          parameters: [calendarIdParam, ...qparams(listEventsQuery)],
          responses: {
            "200": {
              description: "Events",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      items: {
                        type: "array",
                        items: { $ref: "#/components/schemas/NormalizedEvent" },
                      },
                      timeZone: { type: ["string", "null"] },
                    },
                  },
                },
              },
            },
            "400": errResp("Bad window/params"),
            "401": errResp("Auth failure"),
          },
        },
        post: {
          summary: "Create an event",
          description:
            `${writeScope} Pass idempotencyKey on retries; it is stored as ` +
            "extendedProperties.private.khKey so duplicate submissions are recognizable.",
          parameters: [calendarIdParam],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: z.toJSONSchema(createEventBody) },
            },
          },
          responses: {
            "201": {
              description: "Created",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/NormalizedEvent" } },
              },
            },
            "400": errResp("Bad body"),
            "401": errResp("Auth failure"),
          },
        },
      },
      "/events/{eventId}": {
        get: {
          summary: "Get one event",
          description: `${readScope} calendarId is a required query param (Google needs it).`,
          parameters: [eventIdParam, ...qparams(getEventQuery)],
          responses: {
            "200": {
              description: "Event",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/NormalizedEvent" } },
              },
            },
            "404": errResp("Not found"),
            "401": errResp("Auth failure"),
          },
        },
        patch: {
          summary: "Update an event",
          description: `${writeScope} Omitted fields are left unchanged.`,
          parameters: [eventIdParam, ...qparams(getEventQuery)],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: z.toJSONSchema(updateEventBody) },
            },
          },
          responses: {
            "200": {
              description: "Updated",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/NormalizedEvent" } },
              },
            },
            "404": errResp("Not found"),
            "401": errResp("Auth failure"),
          },
        },
        delete: {
          summary: "Delete an event",
          description:
            `${writeScope} Default moves to trash (restorable). ` +
            "confirm=true permanently deletes.",
          parameters: [eventIdParam, ...qparams(deleteEventQuery)],
          responses: {
            "200": {
              description: "Deleted",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok: { type: "boolean" },
                      deleted: { type: "boolean" },
                      trashed: { type: "boolean" },
                    },
                  },
                },
              },
            },
            "404": errResp("Not found"),
            "401": errResp("Auth failure"),
          },
        },
      },
    },
  };
}
