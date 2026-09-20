import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  createAgentMiddleware,
  requireAgentScope,
  type AgentEnv,
} from "./agent-auth.js";
import { tokenService } from "./oauth.js";
import {
  CalendarHttpError,
  runWithCalendar,
  type CalendarBackend,
} from "../services/calendar.js";
import {
  calendarIdParam,
  createEventBody,
  deleteEventQuery,
  eventIdParam,
  getEventQuery,
  listEventsQuery,
  updateEventBody,
} from "../schemas/calendar.js";

const v1 = new Hono<AgentEnv>();

v1.use("/*", createAgentMiddleware());

function agentUserId(c: { get: (k: "agent") => { userId: string } }): string {
  return c.get("agent").userId;
}

function calendarError(c: Context, e: unknown) {
  if (e instanceof CalendarHttpError) {
    if (e.retryAfterSec !== undefined) c.header("Retry-After", String(e.retryAfterSec));
    return c.json({ error: e.code, message: e.message }, e.status);
  }
  return c.json({ error: "internal", message: "Unexpected failure" }, 500);
}

// Connectivity probe for agents (and the 401/403/429 matrix test).
// Kept: doubles as a cheap "is my key alive" check in SKILL.md.
v1.get("/ping", requireAgentScope("calendar:read"), (c) => {
  const agent = c.get("agent");
  return c.json({ ok: true, key: agent.prefix, scopes: agent.scopes });
});

v1.get("/calendars", requireAgentScope("calendar:read"), async (c) => {
  try {
    const items = await runWithCalendar(tokenService(), agentUserId(c), (b) =>
      b.listCalendars(),
    );
    return c.json({ items });
  } catch (e) {
    return calendarError(c, e);
  }
});

v1.get(
  "/calendars/:calendarId/events",
  requireAgentScope("calendar:read"),
  zValidator("param", calendarIdParam),
  zValidator("query", listEventsQuery),
  async (c) => {
    try {
      const { calendarId } = c.req.valid("param");
      const q = c.req.valid("query");
      const out = await runWithCalendar(tokenService(), agentUserId(c), (b) =>
        b.listEvents(calendarId, q),
      );
      return c.json(out);
    } catch (e) {
      return calendarError(c, e);
    }
  },
);

v1.post(
  "/calendars/:calendarId/events",
  requireAgentScope("calendar:write"),
  zValidator("param", calendarIdParam),
  zValidator("json", createEventBody),
  async (c) => {
    try {
      const { calendarId } = c.req.valid("param");
      const body = c.req.valid("json");
      const event = await runWithCalendar(tokenService(), agentUserId(c), (b) =>
        b.createEvent(calendarId, body),
      );
      return c.json(event, 201);
    } catch (e) {
      return calendarError(c, e);
    }
  },
);

v1.get(
  "/events/:eventId",
  requireAgentScope("calendar:read"),
  zValidator("param", eventIdParam),
  zValidator("query", getEventQuery),
  async (c) => {
    try {
      const { eventId } = c.req.valid("param");
      const { calendarId } = c.req.valid("query");
      const event = await runWithCalendar(tokenService(), agentUserId(c), (b) =>
        b.getEvent(calendarId, eventId),
      );
      return c.json(event);
    } catch (e) {
      return calendarError(c, e);
    }
  },
);

v1.patch(
  "/events/:eventId",
  requireAgentScope("calendar:write"),
  zValidator("param", eventIdParam),
  zValidator("query", getEventQuery),
  zValidator("json", updateEventBody),
  async (c) => {
    try {
      const { eventId } = c.req.valid("param");
      const { calendarId } = c.req.valid("query");
      const body = c.req.valid("json");
      const event = await runWithCalendar(tokenService(), agentUserId(c), (b) =>
        b.updateEvent(calendarId, eventId, body),
      );
      return c.json(event);
    } catch (e) {
      return calendarError(c, e);
    }
  },
);

v1.delete(
  "/events/:eventId",
  requireAgentScope("calendar:write"),
  zValidator("param", eventIdParam),
  zValidator("query", deleteEventQuery),
  async (c) => {
    try {
      const { eventId } = c.req.valid("param");
      const { calendarId, confirm } = c.req.valid("query");
      await runWithCalendar(
        tokenService(),
        agentUserId(c),
        (b: CalendarBackend) =>
          confirm
            ? b.deleteEvent(calendarId, eventId)
            : b.trashEvent(calendarId, eventId),
      );
      return c.json({ ok: true, deleted: confirm, trashed: !confirm });
    } catch (e) {
      return calendarError(c, e);
    }
  },
);

export default v1;
