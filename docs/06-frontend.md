# 06 — Frontend

Source: `web/` (Vite config, `src/components/`, `src/lib/`, `src/hooks/`).

## Stack

- **Vite 6** + **React 19** (`web/package.json`).
- **Tailwind CSS v4** via the `@tailwindcss/vite` plugin (no separate
  `tailwind.config.js` — v4 is configured through `@import "tailwindcss"` and
  `@theme inline { ... }` directly in `web/src/index.css`, which defines the
  color tokens as CSS variables (`--background`, `--primary`, etc.) and a
  `.dark` variant block).
- **shadcn/ui** (`web/components.json`, style `"new-york"`, base color
  `neutral`, icon library `lucide`), providing `button`, `dialog`,
  `checkbox`, `card`, and `badge` under `web/src/components/ui/`.
- **`tw-animate-css`** for the small keyframe utilities shadcn's `Dialog`
  needs for open/close transitions.

## The `@/` alias and dev proxy

`web/vite.config.ts`:

```ts
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    proxy: {
      "/api": "http://localhost:3001",
      "/source": "http://localhost:3001",
    },
  },
});
```

- `@/*` resolves to `web/src/*` (mirrored in `web/tsconfig.json`'s
  `"paths": { "@/*": ["./src/*"] }` and in `components.json`'s `aliases`, so
  both the TypeScript compiler and shadcn's own file generator agree on it).
  Every import in `web/src/` uses this alias (e.g. `@/components/ui/button`,
  `@/lib/utils`, `@/hooks/useBulkDownload`) rather than relative paths.
- The dev server proxies **only** `/api` and `/source` to the backend on
  port 3001 — asset metadata (`/api/assets`) and thumbnail bytes
  (`/source/:file`) both need to be same-origin from the browser's
  perspective so relative `fetch()` and `<img src>` calls work without CORS.
  **Downloads deliberately don't go through this proxy**: the signed URL
  returned by the `done` SSE event (and stored in run history) is the
  server's own absolute `http://localhost:3001/...` origin URL, because it's
  a URL the user opens directly (in a new tab, or via "Open"/"Copy link" in
  the modal) — it has to be a real, absolute, signable location, not a
  dev-proxy-relative path that only makes sense inside the Vite dev server.

## The `FlowWidget`

`web/src/components/FlowWidget.tsx` is a **hand-built inline SVG** — no
charting or diagramming library. It reads the same `FLOW_STAGES` array from
`web/src/lib/flowStages.ts` that both the doc's mermaid diagram and the
`useBulkDownload` hook use, so node order/labels never drift out of sync
between the widget and the underlying protocol.

For each stage it draws a rounded `<rect>` node colored by `StageStatus`
(`idle` / `active` / `done` / `skipped` / `error`, via lookup tables
`statusColor`/`textColor` using Tailwind's `fill-*`/`stroke-*` utility
classes so the widget follows the app's light/dark theme tokens rather than
hardcoded colors) and a label. A separate two-step indicator (driven by
`STEP_LABELS`) shows whether the flow is currently in Step 1 (generate the
link) or Step 2 (use it for the ZIP).

Between adjacent nodes it draws a `<line>` edge, animated with an
SVG `<animate>`-driven traveling dot when the *next* stage is `"active"`,
and rendered dashed when the next stage is `"skipped"` — this is what makes
the HIT short-circuit visually obvious: the edges into `build` and `tee`
render dashed instead of solid/animated.

## The modal

`web/src/components/BulkDownloadModal.tsx` wraps shadcn's `Dialog` /
`DialogContent` / `DialogHeader` / `DialogTitle` / `DialogDescription`
primitives (`web/src/components/ui/dialog.tsx`). It's a thin, mostly
presentational component driven entirely by props passed down from
`App.tsx`'s `useBulkDownload()` state: while `loading` it shows a "preparing
your signed download link" message; once `downloadUrl` is set it shows the
link (selectable/copyable, with a "served from cache" note when `cacheHit`
is true) plus "Open" and "Copy link" actions; on `error` it shows the message
and a "Try again" button wired to `onRetry`, which just re-calls
`dl.start()` with the same selection.

## IndexedDB run history

`web/src/lib/runHistory.ts` wraps a small IndexedDB database, opened with:

```ts
const DB_NAME = "bulk-download-demo";
const STORE = "runs";
```

The `runs` object store uses `keyPath: "id"` with `autoIncrement: true`, so
`addRun()` never needs to generate its own ID. The stored record shape is:

```ts
interface RunRecord {
  id?: number;
  at: number;            // Date.now() when the run completed
  assetIds: string[];
  zipName: string;
  checksum: string;
  cacheHit: boolean;
  downloadUrl: string;
  expiresAt: string;
}
```

Three functions cover the whole surface: `addRun()` (called from
`useBulkDownload`'s `done` handler, once per completed run — never on
error), `listRuns()` (returns all runs sorted newest-first by `at`), and
`clearRuns()` (wipes the store). Each opens its own connection and closes it
when done rather than holding one open connection for the app's lifetime —
simple at the cost of a little redundant setup per call, which is fine at
demo scale.

`web/src/components/RunHistory.tsx` (a shadcn `Card`) re-fetches via
`listRuns()` whenever its `refreshKey` prop changes; `App.tsx` bumps that key
(`setHistoryKey((k) => k + 1)`) whenever `dl.downloadUrl` transitions to a
new value, i.e. once per completed run. Each row shows the zip name, a
relative timestamp, file count, a truncated checksum, a HIT/MISS `Badge`,
and an "Open" link straight to the stored `downloadUrl` — which means a
previously-completed run's link remains directly usable for as long as its
`expiresAt` allows, without re-running the flow.

## Component map

| File | Role |
|---|---|
| `web/src/App.tsx` | Top-level composition: asset grid, selection state, wires `useBulkDownload` to the widget/modal/history. |
| `web/src/hooks/useBulkDownload.ts` | SSE client + stage-state machine; see [`05-sse-flow.md`](05-sse-flow.md). |
| `web/src/lib/flowStages.ts` | The single source of truth for stage IDs, labels, and the two-step grouping (`step`). |
| `web/src/lib/runHistory.ts` | IndexedDB persistence for completed runs. |
| `web/src/components/FlowWidget.tsx` | The live SVG flow diagram. |
| `web/src/components/BulkDownloadModal.tsx` | The result/progress dialog. |
| `web/src/components/RunHistory.tsx` | The persisted run list panel. |
| `web/src/components/Walkthrough.tsx` | Static explanatory copy walking through each stage plus the two headline techniques. |
| `web/src/components/ui/*` | Generated shadcn primitives (`button`, `dialog`, `checkbox`, `card`, `badge`). |

## Next

- [`05-sse-flow.md`](05-sse-flow.md) — the protocol this UI consumes.
- [`01-overview.md`](01-overview.md) — what all of this is demonstrating and why.
