import { OAuth2Client } from "google-auth-library";
import { google, type calendar_v3 } from "googleapis";
import type {
  CreateEventBody,
  ListEventsQuery,
  UpdateEventBody,
} from "../schemas/calendar.js";

export type CalendarStatus = 400 | 401 | 403 | 404 | 429 | 502;

export class CalendarHttpError extends Error {
  retryableAuth: boolean;
  retryAfterSec?: number;
  constructor(
    public status: CalendarStatus,
    public code: string,
    message: string,
    opts?: { retryableAuth?: boolean; retryAfterSec?: number },
  ) {
    super(message);
    this.retryableAuth = opts?.retryableAuth ?? false;
    this.retryAfterSec = opts?.retryAfterSec;
  }
}

/** Minimal agent-facing event shape. All timestamps UTC ISO. */
export interface NormalizedEvent {
  id: string;
  calendarId: string;
  status: string | null;
  summary: string;
  description: string | null;
  location: string | null;
  start: { dateTime: string | null; timeZone: string | null };
  end: { dateTime: string | null; timeZone: string | null };
  updated: string | null;
}

interface GoogleEventLike {
  id?: string | null;
  status?: string | null;
  summary?: string | null;
  description?: string | null;
  location?: string | null;
  start?: { dateTime?: string | null; timeZone?: string | null } | null;
  end?: { dateTime?: string | null; timeZone?: string | null } | null;
  updated?: string | null;
}

export function normalizeEvent(
  calendarId: string,
  e: GoogleEventLike,
): NormalizedEvent {
  if (!e.id) throw new CalendarHttpError(502, "google_error", "Google returned an event without id");
  return {
    id: e.id,
    calendarId,
    status: e.status ?? null,
    summary: e.summary ?? "(no title)",
    description: e.description ?? null,
    location: e.location ?? null,
    start: { dateTime: e.start?.dateTime ?? null, timeZone: e.start?.timeZone ?? null },
    end: { dateTime: e.end?.dateTime ?? null, timeZone: e.end?.timeZone ?? null },
    updated: e.updated ?? null,
  };
}

export interface CalendarListEntry {
  id: string;
  summary: string;
  timeZone: string | null;
  primary: boolean;
  accessRole: string | null;
}

export interface CalendarBackend {
  listCalendars(): Promise<CalendarListEntry[]>;
  listEvents(
    calendarId: string,
    q: ListEventsQuery,
  ): Promise<{ items: NormalizedEvent[]; timeZone: string | null }>;
  getEvent(calendarId: string, eventId: string): Promise<NormalizedEvent>;
  createEvent(calendarId: string, body: CreateEventBody): Promise<NormalizedEvent>;
  updateEvent(
    calendarId: string,
    eventId: string,
    body: UpdateEventBody,
  ): Promise<NormalizedEvent>;
  trashEvent(calendarId: string, eventId: string): Promise<void>;
  deleteEvent(calendarId: string, eventId: string): Promise<void>;
}

export function googleBackend(accessToken: string): CalendarBackend {
  const auth = new OAuth2Client();
  auth.setCredentials({ access_token: accessToken });
  const cal = google.calendar({ version: "v3", auth });
  return {
    listCalendars: async () => {
      const { data } = await cal.calendarList.list({ maxResults: 100 });
      return (data.items ?? [])
        .filter((i) => !!i.id)
        .map((i) => ({
          id: i.id as string,
          summary: i.summary ?? "",
          timeZone: i.timeZone ?? null,
          primary: i.primary ?? false,
          accessRole: i.accessRole ?? null,
        }));
    },
    listEvents: async (calendarId, q) => {
      const { data } = await cal.events.list({
        calendarId,
        timeMin: q.timeMin,
        timeMax: q.timeMax,
        q: q.q,
        maxResults: q.maxResults,
        singleEvents: true,
        orderBy: "startTime",
      });
      return {
        items: (data.items ?? []).map((e) => normalizeEvent(calendarId, e)),
        timeZone: data.timeZone ?? null,
      };
    },
    getEvent: async (calendarId, eventId) => {
      const { data } = await cal.events.get({ calendarId, eventId });
      return normalizeEvent(calendarId, data);
    },
    createEvent: async (calendarId, body) => {
      const { data } = await cal.events.insert({
        calendarId,
        requestBody: {
          summary: body.summary,
          description: body.description,
          location: body.location,
          start: { dateTime: body.start.dateTime, timeZone: body.start.timeZone },
          end: { dateTime: body.end.dateTime, timeZone: body.end.timeZone },
          attendees: body.attendees?.map((email) => ({ email })),
          extendedProperties: body.idempotencyKey
            ? { private: { khKey: body.idempotencyKey } }
            : undefined,
        },
      });
      return normalizeEvent(calendarId, data);
    },
    updateEvent: async (calendarId, eventId, body) => {
      const requestBody: calendar_v3.Schema$Event = {};
      if (body.summary !== undefined) requestBody.summary = body.summary;
      if (body.description !== undefined) requestBody.description = body.description;
      if (body.location !== undefined) requestBody.location = body.location;
      if (body.start) {
        requestBody.start = {
          dateTime: body.start.dateTime,
          timeZone: body.start.timeZone,
        };
      }
      if (body.end) {
        requestBody.end = {
          dateTime: body.end.dateTime,
          timeZone: body.end.timeZone,
        };
      }
      if (body.attendees !== undefined) {
        requestBody.attendees = body.attendees.map((email) => ({ email }));
      }
      const { data } = await cal.events.patch({ calendarId, eventId, requestBody });
      return normalizeEvent(calendarId, data);
    },
    // googleapis v144 dropped events.trash from typings; cancelling via patch
    // is the documented equivalent (organizer keeps a restorable cancelled copy).
    trashEvent: async (calendarId, eventId) => {
      await cal.events.patch({ calendarId, eventId, requestBody: { status: "cancelled" } });
    },
    deleteEvent: async (calendarId, eventId) => {
      await cal.events.delete({ calendarId, eventId });
    },
  };
}

interface GoogleErrorLike {
  code?: unknown;
  message?: unknown;
  response?: { headers?: Record<string, string | undefined> };
}

export function mapGoogleError(e: unknown): CalendarHttpError {
  const g = e as GoogleErrorLike | null;
  const code = typeof g?.code === "number" ? g.code : 0;
  const detail =
    typeof g?.message === "string" && g.message ? `: ${g.message}` : "";
  if (code === 401) {
    return new CalendarHttpError(
      401,
      "google_unauthorized",
      "Google rejected the access token.",
      { retryableAuth: true },
    );
  }
  if (code === 404 || code === 410) {
    return new CalendarHttpError(404, "not_found", `Calendar or event not found${detail}`);
  }
  if (code === 400) {
    return new CalendarHttpError(400, "bad_request", `Google rejected the request${detail}`);
  }
  if (code === 403) {
    return new CalendarHttpError(403, "google_forbidden", `Google refused the operation${detail}`);
  }
  if (code === 429) {
    const raw = g?.response?.headers?.["retry-after"];
    const retryAfterSec = raw !== undefined ? Number(raw) : NaN;
    return new CalendarHttpError(
      429,
      "google_rate_limited",
      "Google rate limit hit. Retry later.",
      Number.isFinite(retryAfterSec) && retryAfterSec > 0
        ? { retryAfterSec }
        : undefined,
    );
  }
  if (code >= 500 && code < 600) {
    return new CalendarHttpError(502, "google_unavailable", `Google errored${detail}`);
  }
  const message = e instanceof Error ? e.message : String(e);
  return new CalendarHttpError(502, "google_error", `Upstream failure: ${message}`);
}

export interface TokenProvider {
  getAccessToken(userId: string): Promise<string>;
  refreshNow(userId: string): Promise<string>;
}

/**
 * Run an operation with a fresh token; on Google 401, force one refresh and
 * retry once. A second 401 means the grant itself is dead → 502 telling the
 * user to reconnect (distinct from key-auth 401s).
 */
export async function runWithCalendar<T>(
  tokens: TokenProvider,
  userId: string,
  fn: (backend: CalendarBackend) => Promise<T>,
  buildBackend: (accessToken: string) => CalendarBackend = googleBackend,
): Promise<T> {
  try {
    return await fn(buildBackend(await tokens.getAccessToken(userId)));
  } catch (e) {
    const mapped = e instanceof CalendarHttpError ? e : mapGoogleError(e);
    if (!mapped.retryableAuth) throw mapped;
    try {
      const fresh = await tokens.refreshNow(userId);
      return await fn(buildBackend(fresh));
    } catch (retryErr) {
      const m2 =
        retryErr instanceof CalendarHttpError ? retryErr : mapGoogleError(retryErr);
      throw new CalendarHttpError(
        502,
        "google_auth_failed",
        "Google rejected the token even after refresh. Reconnect the Calendar connection.",
        { retryAfterSec: m2.retryAfterSec },
      );
    }
  }
}
