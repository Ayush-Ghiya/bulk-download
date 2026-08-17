# 05 — SSE Flow

Source: `server/src/routes.ts` (`GET /api/bulk-download/stream`) and
`web/src/hooks/useBulkDownload.ts` (the consumer).

## The endpoint

```
GET /api/bulk-download/stream?assetIds=<csv>&zipName=<name>
```

- `assetIds` — a comma-separated list of asset IDs, trimmed and
  empty-filtered.
- `zipName` — the desired archive filename; defaults to `assets.zip` if
  omitted or blank.

The handler is built with Hono's `streamSSE` helper, which sets
`Content-Type: text/event-stream` and gives the handler a `writeSSE({
event, data })` primitive. Every event in this endpoint is sent as
`event: <name>` with a JSON string body — the route's `send()` helper wraps
this: `s.writeSSE({ event, data: JSON.stringify(data) })`.

The connection is one-shot: it runs the whole selection → sign → build →
cache lifecycle for a single request, then either sends `done` and returns,
or sends `error` and returns. It does not stay open for further asset
selections — the browser opens a fresh `EventSource` per "Download all"
click (`useBulkDownload.start()`).

## Event table

Events are emitted strictly in this order (with short `sleep()` delays
between the narrated ones, purely for the demo's visual pacing):

| Event | Real / Narrated | Payload | Meaning |
|---|---|---|---|
| `browser` | Narrated | `{ message }` | The request "leaves the browser" — no actual network hop; just marks the stage active for the widget. |
| `bff` | Narrated | `{ message }` | Stands in for a dashboard BFF proxy hop that doesn't exist in this single-service demo. |
| `resolve` | Real | `{ resolved, requested }` | `catalog.findByIds(assetIds)` ran; counts of how many of the requested IDs actually resolved to known assets. If zero resolved, an `error` event is sent instead of continuing. |
| `payload-write` | Real | `{ checksum, key }` | `payload.json` was written to the derived store for this checksum (see [`04-tee-stream-and-cache.md`](04-tee-stream-and-cache.md)). |
| `sign` | Real | `{ expiresAt }` | The signed download URL was minted (see [`03-signed-urls.md`](03-signed-urls.md)). |
| `cdn` | Narrated | `{ message }` | Stands in for the CDN edge hop; no CDN is actually in the path. |
| `origin-verify` | Real | `{ verified }` | The stream independently re-runs `signer.verify()` against the just-minted URL, to demonstrate — and let the widget show — that the origin doesn't just trust the signer's output blindly. |
| `cache-check` | Real | `{ hit }` | `storage.existsDerived(archiveKey)` result. Drives the HIT/MISS branch. |
| `build` | Real | `{ name, index, total }` | Emitted once per file as `ZipArchiveBuilder` appends it to the archive (`onEntry` callback). Only sent on a MISS. |
| `tee` | Real | `{ message }` | Sent once the archive has fully streamed to both the client-drain and the cache write, on a MISS only. |
| `done` | Real | `{ downloadUrl, checksum, cacheHit, expiresAt }` | Terminal success event. Closes the stream. |
| `error` | Real | `{ message }` | Terminal failure event — either "no valid assets selected" or a caught exception's message. Closes the stream. |

On a **HIT**, the sequence short-circuits after `cache-check`: no `build` or
`tee` events are ever sent for that request — the handler goes straight from
`cache-check` to `done` with `cacheHit: true`.

On a **MISS**, `build` fires once per entry (so N files means N `build`
events, each with an incrementing `index`/`total`), then exactly one `tee`
event, then `done` with `cacheHit: false`.

## `done` and `error` payloads

```ts
// done
{ downloadUrl: string, checksum: string, cacheHit: boolean, expiresAt: string }

// error
{ message: string }
```

`downloadUrl` is the full signed URL from `03-signed-urls.md` — the browser
is expected to open it (or let the user copy/open it) to actually receive
the ZIP bytes; the SSE stream itself never carries archive bytes.

## How `useBulkDownload` maps events onto stages

`web/src/hooks/useBulkDownload.ts` keeps an ordered array of `StageState`
(one per `FLOW_STAGES` entry from `web/src/lib/flowStages.ts`, whose IDs are
exactly the event names above minus `error`). It opens one `EventSource` per
`start()` call and registers a listener per event name via a lookup table:

```ts
const EVENT_TO_STAGE: Record<string, StageId> = {
  browser: "browser", bff: "bff", resolve: "resolve",
  "payload-write": "payload-write", sign: "sign", cdn: "cdn",
  "origin-verify": "origin-verify", "cache-check": "cache-check",
  build: "build", tee: "tee", done: "done",
};
```

For most events, the listener calls `markActive(stageId, detail)`, which:

- Sets that stage's status to `"active"`.
- Marks every *earlier* stage that was still `"active"` as `"done"` — so as
  the stream progresses, stages settle into `"done"` behind the current
  active one without an explicit "previous stage finished" event from the
  server.

Two events get special handling instead of the generic `markActive`:

- **`cache-check`** — besides marking the stage active, it records
  `cacheHit` in the hook's state immediately (`setCacheHit(Boolean(data.hit))`),
  so the UI can react to HIT/MISS before `done` arrives.
- **`done`** — calls `finish(cacheHit)`, which marks every stage that's still
  `"active"` or `"idle"` as `"done"` — **except** that if `hit` is true, the
  `build` and `tee` stages are explicitly set to `"skipped"` rather than
  `"done"`, since they never ran for this request. This is the HIT
  short-circuit surfaced visually: the flow widget shows `build`/`tee` as
  skipped (dashed, muted) instead of completed. `done` also records
  `downloadUrl`/`checksum`/`cacheHit`, closes the `EventSource`, and persists
  the run via `addRun()` into the IndexedDB run history (see
  [`06-frontend.md`](06-frontend.md)).

An `error` listener is registered separately: it sets the hook's `error`
state, marks any currently-`"active"` stage as `"error"`, and closes the
connection. The native `EventSource` `error` event (used for actual
connection failures, distinct from the server-sent `error` *named* SSE
event) is handled the same way, falling back to `"Connection lost"` if there's
no parsable payload.

## Next

- [`06-frontend.md`](06-frontend.md) — the widget, modal, and run-history UI that consume this hook.
- [`04-tee-stream-and-cache.md`](04-tee-stream-and-cache.md) — what actually happens during `build`/`tee`.
- Back to [`02-architecture.md`](02-architecture.md) · [`01-overview.md`](01-overview.md).
