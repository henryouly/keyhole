import { z } from "zod";

export const MAX_LIST_WINDOW_DAYS = 90;
export const DEFAULT_MAX_RESULTS = 25;
export const MAX_MAX_RESULTS = 100;

const dateTime = z.string().datetime({ offset: true });

export const calendarIdParam = z.object({
  calendarId: z.string().min(1).max(512),
});

export const eventIdParam = z.object({
  eventId: z.string().min(1).max(1024),
});

const eventIdQuery = z.object({
  calendarId: z.string().min(1).max(512),
});

export const listEventsQuery = z
  .object({
    timeMin: dateTime,
    timeMax: dateTime,
    maxResults: z.coerce.number().int().min(1).max(MAX_MAX_RESULTS).default(DEFAULT_MAX_RESULTS),
    q: z.string().max(200).optional(),
  })
  .refine(
    (d) => {
      const span = new Date(d.timeMax).getTime() - new Date(d.timeMin).getTime();
      return span > 0 && span <= MAX_LIST_WINDOW_DAYS * 86400_000;
    },
    { message: "timeMax must be after timeMin and within 90 days" },
  );

const eventDateTime = z.object({
  dateTime,
  timeZone: z.string().max(64).optional(),
});

export const createEventBody = z.object({
  summary: z.string().min(1).max(1024),
  description: z.string().max(8192).optional(),
  location: z.string().max(1024).optional(),
  start: eventDateTime,
  end: eventDateTime,
  attendees: z.array(z.string().email().max(320)).max(20).optional(),
  /** Stored as extendedProperties.private.khKey for safe agent retries. */
  idempotencyKey: z.string().min(1).max(128).optional(),
});

export const updateEventBody = z.object({
  summary: z.string().min(1).max(1024).optional(),
  description: z.string().max(8192).optional(),
  location: z.string().max(1024).optional(),
  start: eventDateTime.optional(),
  end: eventDateTime.optional(),
  attendees: z.array(z.string().email().max(320)).max(20).optional(),
});

export const deleteEventQuery = eventIdQuery.extend({
  /** Default false = move to trash. True = permanent delete. */
  confirm: z.coerce.boolean().default(false),
});

export const getEventQuery = eventIdQuery;

export type ListEventsQuery = z.infer<typeof listEventsQuery>;
export type CreateEventBody = z.infer<typeof createEventBody>;
export type UpdateEventBody = z.infer<typeof updateEventBody>;
