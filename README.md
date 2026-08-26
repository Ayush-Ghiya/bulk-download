# Bulk Download Demo

A standalone extract of the Media Library's "Download All" feature: select a handful
of assets and watch a live Server-Sent Events flow light up the real,
two-step production flow in real time — Step 1 generates a signed download
link (resolve the selection, write a record of it, sign it); Step 2 uses
that link to get the ZIP (verify the token, check the cache, then either
serve a cached archive or build one, streaming it to the client and the
cache at the same time). It's a genuinely idempotent, content-addressed
cache and a tee-streaming archive builder underneath, not a toy simulation
of one.

## What it demonstrates

- **Tee-stream cache** — the ZIP is built once, streamed to the client and
  written to a derived-object cache at the same time via two `PassThrough`s
  piped off a single `archiver` instance, with an atomic temp-then-rename
  write so a partial build is never mistaken for a cached hit.
- **Content-addressed, idempotent archives** — a SHA-256 checksum over the
  exact asset selection, order, and zip name names both the archive's
  `payload.json` and its `download.zip`, so requesting the same selection
  twice is a cache HIT, not a rebuild.
- **HMAC-signed, expiring links** — `/assets/{tenant}/download-all/{checksum}/{zipName}`
  URLs signed with `base64url(HMAC-SHA256(key, pathname + "\n" + expires))`,
  independently re-verified by the origin route rather than trusted blindly.
- **Live SSE flow visualization** — a hand-built SVG widget with an
  animated particle pipeline tracks every stage of the real two-step flow
  (Step 1: generate the signed link; Step 2: use it to serve or build the
  ZIP) as `GET /api/bulk-download/stream` emits them, including a visible
  HIT short-circuit that skips the build/tee stages.
- **IndexedDB run history** — every completed run is persisted client-side
  so past download links stay reachable without re-running the flow.

## Prerequisites

- [Bun](https://bun.sh) (used to run both the server and the web dev server).

## Run

This repo is a Bun workspaces monorepo (`server/` and `web/`), with a single
root install and a single command to bring both processes up:

```bash
bun install   # one install at the repo root, hoists shared deps
bun run dev   # runs server (:3001) and web (:5173) dev servers in parallel
```

Other root scripts:

```bash
bun run build         # builds the web app for production (server has no build step)
bun run preview       # serves the production web build
bun run start:server  # runs the server without --watch
bun run typecheck     # typechecks workspace packages that define a typecheck script
```

Open the web app's dev URL (http://localhost:5173), select a few assets,
click "Download all", and watch the flow widget. Run it again with the same
selection to see a cache HIT (the `build`/`tee` stages will show as
skipped).

## Docs

- [`docs/01-overview.md`](docs/01-overview.md) — what the real feature does, the business problem, and what this demo implements.
- [`docs/02-architecture.md`](docs/02-architecture.md) — full production topology and how this one service maps onto it, with a diagram.
- [`docs/03-signed-urls.md`](docs/03-signed-urls.md) — the HMAC token scheme, link shape, expiry, and origin re-verification.
- [`docs/04-tee-stream-and-cache.md`](docs/04-tee-stream-and-cache.md) — the centerpiece: the checksum, the tee-streaming builder, and the atomic cache write.
- [`docs/05-sse-flow.md`](docs/05-sse-flow.md) — the SSE event protocol and how the frontend maps events to stage state.
- [`docs/06-frontend.md`](docs/06-frontend.md) — the Vite/Tailwind v4/shadcn stack, the SVG flow widget, and the IndexedDB run history.
