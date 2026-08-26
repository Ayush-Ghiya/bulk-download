# 01 — Overview

## What "Download All" does in the Media Library

The Media Library lets a user select a set of media assets (images, documents, video
stills — anything with a stored source object) and download them as a single
ZIP. The dashboard shows a "Download all" button; clicking it hands the API a
list of asset IDs and a desired archive name, and the user ends up with a
signed link that streams the ZIP.

## The business problem

Naively, "zip up N files and send them" means the server:

1. Reads every source file into memory,
2. Builds the archive in memory or on local disk,
3. Then serves the result.

That works for a handful of small files. It falls over as soon as someone
selects hundreds of assets or a handful of large videos: the process either
runs out of memory buffering everything at once, or wastes minutes rebuilding
the exact same archive every time two people request the exact same
selection.

The real feature solves both problems with two techniques, which this demo
reproduces faithfully:

- **A tee-streaming archive builder.** The ZIP is built once, as a stream, and
  piped to two destinations at the same time — the requesting client and a
  cache — so nothing is buffered in memory and the first requester's work
  benefits every later requester. See
  [`04-tee-stream-and-cache.md`](04-tee-stream-and-cache.md).
- **Content-addressed idempotency.** The exact set of files + zip name hashes
  to a checksum. Two requests for the same selection produce the same
  checksum, so the second request is a cache hit instead of a rebuild. See
  the same doc.

Everything else in the production flow — CDN edge, signed URLs, SSE progress
reporting — exists to make that core mechanism safe and observable to
operate. This project extracts the mechanism into one small standalone
service plus a UI that visualizes the flow live, using Server-Sent Events to
show each stage as it happens.

## What the demo implements

This demo is a faithful extraction, not a full re-implementation of the
Media Library. It runs the real mechanism end to end, as two HTTP requests:
Step 1 generates a signed download link; Step 2 uses that link to get the
ZIP, either served from cache or built and tee-streamed on the spot.

| Aspect | Notes |
|---|---|
| Content-addressed checksum (`BulkDownloadArchive.checksum`) | Real SHA-256 over `{tenantId, zipName, entries}`, order-sensitive. |
| Tee-stream ZIP builder (`archiver` → two `PassThrough`s) | Real, store-mode archiver, no per-file compression cost. |
| Idempotent `payload.json` + `download.zip` cache | Real two-directory filesystem storage, atomic temp-then-rename write. |
| HMAC-signed, expiring URLs | Real HMAC-SHA256 scheme; see [`03-signed-urls.md`](03-signed-urls.md). |
| Origin token re-verification | Real; the download route calls `signer.verify()` independently of the SSE stream. |
| SSE stage-by-stage progress | Real `streamSSE` endpoint driving the live flow widget, covering both requests — including the `bff` and `cdn` stages that mark where those hops sit in the production topology. |

A production deployment adds a few things this single-process demo doesn't
need to illustrate the core mechanism: a real object store (S3 or
equivalent) in place of the two local folders, a separately-deployed
dashboard BFF and CDN instead of one Bun/Hono service standing in for both,
multi-tenant asset isolation and status filtering, an upload/ingestion
pipeline, retry/backoff policies, rate limits, and an automated test suite.
None of those change how the core mechanism works — they're the
operational surface around it.

## Where to go next

- [`02-architecture.md`](02-architecture.md) — full production topology and how this one service maps onto it.
- [`03-signed-urls.md`](03-signed-urls.md) — the token scheme.
- [`04-tee-stream-and-cache.md`](04-tee-stream-and-cache.md) — the centerpiece mechanism.
- [`05-sse-flow.md`](05-sse-flow.md) — the SSE protocol and the frontend's event handling.
- [`06-frontend.md`](06-frontend.md) — the Vite/React/Tailwind/shadcn app and IndexedDB run history.
