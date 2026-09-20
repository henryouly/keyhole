---
name: keyhole-calendar
description: Read and manage the owner's Google Calendar through the Keyhole bridge API (scoped key auth).
---

# Keyhole Calendar skill

Keyhole bridges the owner's Google Calendar to agents. You never see Google
credentials — you get one scoped API key (`kh_live_...`) from the owner and
talk to the bridge REST API below.

## Setup

Ask the owner for your API key (or read it from your environment/config).
The production instance lives at a fixed URL — use it unless the owner tells
you otherwise:

- `KEYHOLE_BASE_URL=https://keyhole-two.vercel.app` (production, no trailing slash)
- `KEYHOLE_API_KEY` — starts with `kh_live_`

```bash
export KEYHOLE_BASE_URL=https://keyhole-two.vercel.app
export KEYHOLE_API_KEY=kh_live_...
```

(Local development only: the owner may instead point you at
`http://localhost:8787` with a dev key. Everything else below is identical.)

This skill file is served live at
`https://keyhole-two.vercel.app/skill.md`; the machine-readable contract at
`https://keyhole-two.vercel.app/api/openapi.json` (OpenAPI 3.1).

Every request needs the header `Authorization: Bearer $KEYHOLE_API_KEY`.
Never print, log, or otherwise reveal the key.

## Rules

- Dates are UTC ISO-8601 (`2026-09-25T10:00:00Z`). Responses echo the calendar's timezone.
- Listing events REQUIRES `timeMin` + `timeMax`, max 90-day span, max 100 results (default 25).
- Writes need the `calendar:write` scope; without it you get `403 forbidden_scope`.
- DELETE moves to trash by default (restorable). Add `confirm=true` only when the owner explicitly wants permanent deletion. Confirm bulk/recurring-series deletes with the owner first.
- Google reads lag writes: an immediate get-after-delete may still return the event with `status: "cancelled"` — trust the delete response + listings, not the instant re-get.
- On create, pass `idempotencyKey` (any unique string) so retries are recognizable.
- Calendar IDs: `primary` works, or URL-encode the full ID.
- Errors are `{ "error": "<code>", "message": "..." }`. `401` = key problem (invalid/revoked/expired). `429` = quota, honor `Retry-After`. `502 google_auth_failed` = owner's Google grant died; tell the owner to reconnect in the dashboard — you cannot fix it.

## Endpoints

```bash
# Is my key alive? (needs calendar:read)
curl -s -H "Authorization: Bearer $KEYHOLE_API_KEY" $KEYHOLE_BASE_URL/api/v1/ping

# List calendars
curl -s -H "Authorization: Bearer $KEYHOLE_API_KEY" $KEYHOLE_BASE_URL/api/v1/calendars

# List events (timeMin/timeMax REQUIRED)
CAL=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "primary")
curl -s -H "Authorization: Bearer $KEYHOLE_API_KEY" \
  "$KEYHOLE_BASE_URL/api/v1/calendars/$CAL/events?timeMin=2026-09-20T00:00:00Z&timeMax=2026-10-20T00:00:00Z"

# Create (needs calendar:write)
curl -s -X POST -H "Authorization: Bearer $KEYHOLE_API_KEY" -H "Content-Type: application/json" \
  -d '{"summary":"Dentist","start":{"dateTime":"2026-09-25T10:00:00Z"},"end":{"dateTime":"2026-09-25T10:30:00Z"},"idempotencyKey":"dentist-001"}' \
  "$KEYHOLE_BASE_URL/api/v1/calendars/$CAL/events"

# Get / update (needs calendar:read / calendar:write)
curl -s -H "Authorization: Bearer $KEYHOLE_API_KEY" \
  "$KEYHOLE_BASE_URL/api/v1/events/EVENT_ID?calendarId=$CAL"
curl -s -X PATCH -H "Authorization: Bearer $KEYHOLE_API_KEY" -H "Content-Type: application/json" \
  -d '{"summary":"Dentist (moved)"}' \
  "$KEYHOLE_BASE_URL/api/v1/events/EVENT_ID?calendarId=$CAL"

# Trash (default) / permanent delete (needs calendar:write)
curl -s -X DELETE -H "Authorization: Bearer $KEYHOLE_API_KEY" \
  "$KEYHOLE_BASE_URL/api/v1/events/EVENT_ID?calendarId=$CAL"
curl -s -X DELETE -H "Authorization: Bearer $KEYHOLE_API_KEY" \
  "$KEYHOLE_BASE_URL/api/v1/events/EVENT_ID?calendarId=$CAL&confirm=true"
```
