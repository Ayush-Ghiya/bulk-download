# Deploy to Vercel (free) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the bulk-download demo deployable on Vercel's free (Hobby) tier as a single project — the Vite frontend served static + the real Hono backend running as one Node serverless function — while keeping the local `bun run dev` experience working unchanged.

**Architecture:** Three changes make the stateful Bun server serverless-safe: (1) replace the disk-backed `Storage` with an in-memory store (SVG sources bundled as inlined strings; the derived cache is a per-instance `Map`), so no filesystem is required; (2) make the download **stateless** — the signed link carries the selected asset ids, and the serve route rebuilds the ZIP from the bundled sources and confirms it hashes to the signed checksum, so it never depends on state written by the earlier request (which on serverless may hit a different instance); (3) make signed URLs **relative** so they resolve against whatever origin serves the app. A shared `createApp()` factory feeds both the Bun entry (local) and a `hono/vercel` function (`api/index.ts`), wired by `vercel.json`.

**Tech Stack:** Bun + Hono (+ `hono/vercel` adapter), archiver, Vite/React, Vercel Hobby (Node serverless functions, static output).

## Global Constraints

- **Local git only — NEVER push, NEVER deploy.** Preparing the code + config + instructions is the deliverable; pushing to GitHub / running `vercel` is the USER's action. Do not add a git remote, push, or invoke a deploy.
- **No unit tests** (standing project constraint). Verify each task with: `bun run typecheck` (web), a local `bun run dev` end-to-end run (select assets → SSE flow → open the signed link → a real ZIP downloads), and `bun run build` (web) where relevant. Do not add test files.
- **Keep `bun run dev` working** — the local Bun server on :3001 + Vite dev server must still run the full flow after every task.
- **Preserve the real backend** — real ZIP building (archiver, tee-stream), HMAC-SHA256 signing, SSE progress, and cache HIT/MISS all stay real. Only the *persistence medium* (disk → in-memory) and the *URL form* (absolute → relative + ids) change.
- **Free tier only** — no Vercel KV/Blob/Postgres or any paid/add-on service; no env-var secrets required to run (the demo key stays a literal).
- **Tenant/key literals unchanged:** tenant `demo-tenant`, security key `demo-security-key`.

---

## File Structure

- `server/src/sources.ts` — **new.** The 4 seed SVGs inlined as strings + content types. The bundled, fs-free source of truth for asset bytes/streams.
- `server/src/storage.ts` — **rewritten.** In-memory `Storage` (sources from `sources.ts`; derived cache a `Map<string, Buffer>`). Same public method surface the builder/catalog/routes already call.
- `server/src/signer.ts` — **modified.** Emits a **relative** URL (`pathname?token&expires`); `SignResult` exposes `pathname`; `UrlSignerConfig` drops `baseUrl`.
- `server/src/routes.ts` — **modified.** SSE appends `ids` to a relative `downloadUrl`; origin-verify uses `signed.pathname`; the download route is **stateless** (rebuild-from-ids + checksum check) instead of reading `payload.json`.
- `server/src/app.ts` — **new.** `createApp(): Hono` factory (the wiring currently inline in `server.ts`).
- `server/src/server.ts` — **modified.** Thin Bun entry that calls `createApp()`.
- `api/index.ts` — **new.** Vercel Node function: `handle(createApp())`.
- `vercel.json` — **new.** Build command, static output dir, install command, and rewrites routing API paths to the function.
- `web/vite.config.ts` — **modified.** Proxy `/assets` in dev; emit built JS/CSS under `/static/` (not `/assets/`) so they don't collide with the download route.
- `web/src/hooks/useBulkDownload.ts` — **modified.** Absolutize the relative `downloadUrl` against `window.location.origin` for display/copy/open/history.
- `README.md` — **modified.** A "Deploy to Vercel" section.
- `docs/02-architecture.md`, `docs/04-tee-stream-and-cache.md`, `web/src/pages/DeepDivePage.tsx` — **modified.** Re-word the "two local folders / atomic temp-then-rename" storage narrative to the in-memory store (atomicity preserved: the cache key is published only after the archive fully streams).

---

## Task 1: In-memory Storage + bundled sources

Removes the filesystem dependency so the same code runs locally and on serverless. The builder and catalog call `Storage` through a fixed method surface — preserve every signature.

**Files:**
- Create: `server/src/sources.ts`
- Modify (rewrite): `server/src/storage.ts`
- Modify: `server/src/server.ts` (construct `new Storage()` with no config)

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `export const SEED_SOURCES: Record<string, { content: string; contentType: string }>` (keys: `mountains.svg`, `ocean.svg`, `desert.svg`, `forest.svg`)
  - `class Storage` with the SAME methods used elsewhere: `readDerived(key): Promise<Buffer|null>`, `writeDerived(key, body: Buffer): Promise<void>`, `existsDerived(key): Promise<boolean>`, `openDerivedWrite(key): Promise<{ stream: NodeJS.WritableStream; done: Promise<void> }>`, `openSource(sourceKey): NodeJS.ReadableStream`, `sourceBytes(sourceKey): number`. Constructor takes NO arguments now.

- [ ] **Step 1: Create `server/src/sources.ts` with the real SVG bytes inlined**

Read each file under `server/storage/source/` and paste its EXACT contents into a template literal (escape any backtick/`${}` if present — these SVGs contain neither). Shape:

```ts
/**
 * The seed asset sources, inlined so the server needs no filesystem at
 * runtime (serverless has no persistent/writable disk). Kept in sync by
 * hand with the human-readable originals under server/storage/source/.
 */
export interface SeedSource {
  content: string;
  contentType: string;
}

export const SEED_SOURCES: Record<string, SeedSource> = {
  "mountains.svg": { content: `<PASTE mountains.svg VERBATIM>`, contentType: "image/svg+xml" },
  "ocean.svg": { content: `<PASTE ocean.svg VERBATIM>`, contentType: "image/svg+xml" },
  "desert.svg": { content: `<PASTE desert.svg VERBATIM>`, contentType: "image/svg+xml" },
  "forest.svg": { content: `<PASTE forest.svg VERBATIM>`, contentType: "image/svg+xml" },
};
```

- [ ] **Step 2: Rewrite `server/src/storage.ts` as in-memory**

```ts
import { Readable, Writable } from "node:stream";
import { SEED_SOURCES } from "./sources.ts";

/**
 * In-memory storage. Sources come from the bundled SEED_SOURCES; the
 * derived cache is a per-process Map. On serverless this Map lives for the
 * warm instance's lifetime (so the cache HIT demo still works when warm)
 * and resets on a cold start — which is fine because the download route is
 * stateless and never depends on it.
 */
export class Storage {
  private readonly derived = new Map<string, Buffer>();

  async readDerived(key: string): Promise<Buffer | null> {
    return this.derived.get(key) ?? null;
  }

  async writeDerived(key: string, body: Buffer): Promise<void> {
    this.derived.set(key, body);
  }

  async existsDerived(key: string): Promise<boolean> {
    return this.derived.has(key);
  }

  async openDerivedWrite(
    key: string,
  ): Promise<{ stream: NodeJS.WritableStream; done: Promise<void> }> {
    const chunks: Buffer[] = [];
    const stream = new Writable({
      write(chunk, _enc, cb) {
        chunks.push(Buffer.from(chunk));
        cb();
      },
    });
    const done = new Promise<void>((resolve, reject) => {
      stream.on("error", reject);
      // Atomic-by-completion: the key is published only after the archive
      // has fully streamed, so a reader never sees a partial ZIP.
      stream.on("finish", () => {
        this.derived.set(key, Buffer.concat(chunks));
        resolve();
      });
    });
    return { stream, done };
  }

  openSource(sourceKey: string): NodeJS.ReadableStream {
    const src = SEED_SOURCES[sourceKey];
    if (!src) throw new Error(`unknown source: ${sourceKey}`);
    return Readable.from(Buffer.from(src.content, "utf8"));
  }

  sourceBytes(sourceKey: string): number {
    const src = SEED_SOURCES[sourceKey];
    if (!src) throw new Error(`unknown source: ${sourceKey}`);
    return Buffer.byteLength(src.content, "utf8");
  }
}
```

(`StorageConfig` is removed. The `openSource` throw-on-missing preserves the "missing source throws synchronously → builder skips it" behavior the ZIP builder relies on.)

- [ ] **Step 3: Update `server/src/server.ts` to construct `new Storage()`**

Remove the `node:fs` `mkdirSync`, the `node:path` `join`, the `import.meta.dir` source/derived dir computation, and pass no config:

```ts
const storage = new Storage();
```

Leave the rest of `server.ts` as-is for now (signer still constructed with a baseUrl until Task 2; that's fine — this task keeps the app compiling and running).

Note: `Catalog`'s constructor calls `storage.sourceBytes(...)` — unchanged and now reads from `SEED_SOURCES`.

- [ ] **Step 4: Typecheck**

Run: `bun run typecheck`
Expected: PASS. (Web workspace typechecks; the server has no `tsc` step but must not break imports.)

- [ ] **Step 5: Local end-to-end run**

Run: `bun run dev`, open the web URL it prints, select 2–3 assets, click Download all, watch the SSE flow complete (READY), then click **Open** on the dock — a real `assets.zip` downloads and unzips to the selected SVGs. Re-download the same selection → the dock shows a cache **HIT**. Stop the server.
Expected: identical behavior to before, now served entirely from memory.

- [ ] **Step 6: Commit**

```bash
git add server/src/sources.ts server/src/storage.ts server/src/server.ts
git commit -m "refactor(server): in-memory storage with bundled sources (no filesystem)"
```

---

## Task 2: Stateless, origin-agnostic download

Makes the download work regardless of which serverless instance serves it, and regardless of deployment origin. The signed link carries the selection; the serve route rebuilds and re-hashes it.

**Files:**
- Modify: `server/src/signer.ts`
- Modify: `server/src/routes.ts`
- Modify: `server/src/server.ts` (drop `baseUrl` from the `UrlSigner` construction)
- Modify: `web/src/hooks/useBulkDownload.ts`
- Modify: `web/vite.config.ts`

**Interfaces:**
- Consumes: `Storage`, `Catalog`, `BulkDownloadArchive` (unchanged), `UrlSigner`.
- Produces:
  - `interface UrlSignerConfig { securityKey: string; tenantId: string }` (no `baseUrl`)
  - `interface SignResult { url: string; pathname: string; token: string; expires: number; expiresAt: string }` where `url` is relative (`"/assets/…/download-all/…?token=…&expires=…"`).

- [ ] **Step 1: Make the signer emit relative URLs (`server/src/signer.ts`)**

Change `UrlSignerConfig` to `{ securityKey: string; tenantId: string }` (remove `baseUrl` field and the `this.baseUrl` assignment). Add `pathname` to `SignResult`. Replace the `sign()` body's URL construction:

```ts
sign(contentPath: string, opts: { expiresIn?: number } = {}): SignResult {
  const requested = opts.expiresIn ?? DEFAULT_EXPIRES_IN;
  const expiresIn = Math.min(Math.max(Math.floor(requested), 1), MAX_EXPIRES_IN);
  const now = Math.floor(Date.now() / 1000);
  const expires = now + expiresIn;
  const pathname = this.fullPathname(contentPath);
  const token = this.token(pathname, expires);
  const params = new URLSearchParams({ token, expires: String(expires) });
  const url = `${pathname}?${params.toString()}`;
  return { url, pathname, token, expires, expiresAt: new Date(expires * 1000).toISOString() };
}
```

Leave `fullPathname`, `token`, and `verify` exactly as they are.

- [ ] **Step 2: Update the SSE handler + download route (`server/src/routes.ts`)**

In the SSE handler (`GET /api/bulk-download/stream`):
- After `const signed = signer.sign(bulkDownloadContentPath(checksum, zipName));`, build a download URL that carries the selection:

```ts
const idsParam = encodeURIComponent(assets.map((a) => a.id).join(","));
const downloadUrl = `${signed.url}&ids=${idsParam}`;
```

- Replace the origin-verify block's `new URL(signed.url).pathname` with `signed.pathname`:

```ts
const verified = signer.verify(signed.pathname, signed.token, signed.expires);
await send("origin-verify", { verified });
```

- In BOTH `done` events (the HIT short-circuit and the MISS terminal), send `downloadUrl` instead of `signed.url`:

```ts
await send("done", { downloadUrl, checksum, cacheHit: true, expiresAt: signed.expiresAt });
// …and…
await send("done", { downloadUrl, checksum, cacheHit: false, expiresAt: signed.expiresAt });
```

Replace the whole download route with a stateless version:

```ts
app.get("/assets/:tenantId/download-all/:checksum/:zipName", async (c) => {
  const checksum = c.req.param("checksum");
  const zipName = c.req.param("zipName");
  const token = c.req.query("token") ?? "";
  const expires = Number(c.req.query("expires") ?? "0");
  const ids = (c.req.query("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!CHECKSUM.test(checksum)) return c.text("Unknown checksum", 404);

  const pathname = new URL(c.req.url).pathname;
  if (!signer.verify(pathname, token, expires)) {
    return c.text("Invalid or expired token", 401);
  }

  // Stateless: rebuild the archive from the (catalog-resolved) selection
  // carried in the signed link, then confirm it hashes to the signed
  // checksum. This means the serve request never depends on state the
  // earlier stream request wrote — which matters on serverless, where the
  // two requests can hit different instances.
  const assets = catalog.findByIds(ids);
  if (assets.length === 0) return c.text("Unknown checksum", 404);
  const entries = assets.map((a) => ({
    assetId: a.id,
    sourceKey: a.sourceKey,
    entryName: a.name,
    bytes: a.bytes,
  }));
  const archive = new BulkDownloadArchive({ tenantId: TENANT_ID, zipName, entries });
  if (archive.checksum !== checksum) return c.text("Unknown checksum", 404);

  // Best-effort cache: serve the pre-built ZIP if this warm instance has
  // it, otherwise rebuild on the fly.
  const archiveKey = BulkDownloadArchive.archiveKey(checksum);
  const cached = await storage.readDerived(archiveKey);
  const body = cached ? Readable.from(cached) : builder.build(archive);

  const webStream = Readable.toWeb(body as Readable) as ReadableStream;
  return new Response(webStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipName}"`,
    },
  });
});
```

(The `TENANT_ID` constant already exists at the top of `routes.ts`; `BulkDownloadArchive`, `Readable`, `catalog`, `storage`, `builder` are already in scope. `payload.json` is still written earlier in the stream for the visualization's `payload-write` step — leave that write in place; the serve route just no longer reads it.)

- [ ] **Step 3: Drop `baseUrl` where the signer is constructed (`server/src/server.ts`)**

```ts
const signer = new UrlSigner({ securityKey: SECURITY_KEY, tenantId: TENANT_ID });
```

Remove the now-unused `PORT`-based `baseUrl` line from the signer config (keep `PORT` for the Bun `export default { port: PORT, ... }`).

- [ ] **Step 4: Absolutize the download URL on the client (`web/src/hooks/useBulkDownload.ts`)**

In the `done` event handler, the incoming `data.downloadUrl` is now relative. Resolve it against the current origin so display, Copy, Open, and the IndexedDB record all get a real absolute URL:

```ts
const absUrl = new URL(data.downloadUrl, window.location.origin).href;
setDownloadUrl(absUrl);
setChecksum(data.checksum);
setCacheHit(Boolean(data.cacheHit));
finish(Boolean(data.cacheHit));
setLoading(false);
es.close();
esRef.current = null;
void addRun({
  at: Date.now(),
  assetIds,
  zipName,
  checksum: data.checksum,
  cacheHit: Boolean(data.cacheHit),
  downloadUrl: absUrl,
  expiresAt: data.expiresAt,
});
```

(`new URL(relative, origin)` also passes an already-absolute URL through unchanged, so this is safe either way.)

- [ ] **Step 5: Proxy `/assets` in dev (`web/vite.config.ts`)**

The download link is now relative (`/assets/…`), so in local dev the browser hits the Vite dev server, which must forward it to the Bun API. Add `/assets` to the proxy:

```ts
server: {
  proxy: {
    "/api": "http://localhost:3001",
    "/source": "http://localhost:3001",
    "/assets": "http://localhost:3001",
  },
},
```

- [ ] **Step 6: Typecheck**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 7: Local end-to-end run**

Run: `bun run dev`. Select assets → Download all → **Open** the dock link: a real ZIP downloads (now via the relative `/assets/…` URL through the Vite proxy). The dock's Copy value is an absolute `http://localhost:5173/assets/…` URL. Re-download the same selection → **HIT**. Stop the server.
Expected: downloads work end-to-end via relative URLs.

- [ ] **Step 8: Commit**

```bash
git add server/src/signer.ts server/src/routes.ts server/src/server.ts web/src/hooks/useBulkDownload.ts web/vite.config.ts
git commit -m "feat: stateless, origin-relative signed download links"
```

---

## Task 3: Serverless function + build wiring

Adds the shared app factory, the Vercel function, and the project config — the pieces that make `vercel` build and serve the app. Also frees the `/assets/` URL space so Vite's static assets don't collide with the download route.

**Files:**
- Create: `server/src/app.ts`
- Modify: `server/src/server.ts`
- Create: `api/index.ts`
- Create: `vercel.json`
- Modify: `web/vite.config.ts` (set `build.assetsDir`)

**Interfaces:**
- Consumes: everything from Tasks 1–2.
- Produces: `export function createApp(): Hono` from `server/src/app.ts`.

- [ ] **Step 1: Extract the app factory (`server/src/app.ts`)**

```ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import { Catalog } from "./catalog.ts";
import { registerRoutes } from "./routes.ts";
import { UrlSigner } from "./signer.ts";
import { Storage } from "./storage.ts";
import { ZipArchiveBuilder } from "./zip-archive-builder.ts";

const SECURITY_KEY = "demo-security-key"; // demo-only
const TENANT_ID = "demo-tenant";

/**
 * Build a fresh Hono app with its own in-memory storage. Called once per
 * process (Bun locally) or once per warm serverless instance (Vercel), so
 * the derived cache persists for that instance's lifetime.
 */
export function createApp(): Hono {
  const storage = new Storage();
  const catalog = new Catalog(storage);
  const signer = new UrlSigner({ securityKey: SECURITY_KEY, tenantId: TENANT_ID });
  const builder = new ZipArchiveBuilder(storage);

  const app = new Hono();
  app.use("*", cors());
  app.get("/health", (c) => c.text("ok"));
  registerRoutes(app, { catalog, storage, signer, builder });
  return app;
}
```

- [ ] **Step 2: Slim `server/src/server.ts` to a Bun entry**

```ts
import { createApp } from "./app.ts";

const PORT = 3001;
const app = createApp();

export default { port: PORT, fetch: app.fetch };

console.log(`server listening on http://localhost:${PORT}`);
```

- [ ] **Step 3: Create the Vercel function (`api/index.ts`)**

```ts
import { handle } from "hono/vercel";
import { createApp } from "../server/src/app.ts";

// Runs on Vercel's Node.js runtime (default) — required for archiver and
// Node streams. createApp() runs once at module load; the resulting app's
// in-memory cache lives for the warm instance's lifetime.
export default handle(createApp());
```

- [ ] **Step 4: Free `/assets/` for the API — emit Vite build assets under `/static/` (`web/vite.config.ts`)**

Vite's default build output puts JS/CSS under `/assets/`, which would collide with the download route's `/assets/…` rewrite. Add a `build` block:

```ts
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  build: {
    assetsDir: "static",
  },
  server: {
    proxy: {
      "/api": "http://localhost:3001",
      "/source": "http://localhost:3001",
      "/assets": "http://localhost:3001",
    },
  },
});
```

- [ ] **Step 5: Create `vercel.json`**

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "installCommand": "bun install",
  "buildCommand": "bun run build",
  "outputDirectory": "web/dist",
  "rewrites": [
    { "source": "/api/:path*", "destination": "/api" },
    { "source": "/assets/:path*", "destination": "/api" },
    { "source": "/source/:path*", "destination": "/api" },
    { "source": "/health", "destination": "/api" }
  ]
}
```

(`bun run build` is the existing root script → builds the web workspace to `web/dist`. The `/api` directory is auto-detected by Vercel and compiled as a Node function; the rewrites route the API/asset/source/health paths to it. Everything else — `/`, `/static/*`, `index.html` — is served static from `web/dist`. HashRouter means client routes never hit the server, so no SPA fallback rewrite is needed.)

- [ ] **Step 6: Typecheck + web build**

Run: `bun run typecheck && bun run build`
Expected: both PASS; `web/dist/` exists with `index.html` referencing `/static/…` assets (confirm with `grep -o "/static/[^\"']*" web/dist/index.html`).

- [ ] **Step 7: Local end-to-end run (unchanged behavior)**

Run: `bun run dev`; full flow still works (Bun server + Vite). Stop the server. (The Vercel function path can't be exercised without a deploy; Task 4 documents the deploy + the smoke test to run against the live URL.)

- [ ] **Step 8: (Optional) Local Vercel build dry-run**

If you want to validate the function bundles before the user deploys, run: `bunx vercel build` (no login required for a local build; it writes `.vercel/output/`). If it errors on the `.ts` extension imports in `server/src/*`, the fix is to drop the `.ts` extensions in the `api/index.ts` → `app.ts` import chain (esbuild resolves either way). Note the result in the commit/PR notes. Do NOT run `vercel deploy`.

- [ ] **Step 9: Commit**

```bash
git add server/src/app.ts server/src/server.ts api/index.ts vercel.json web/vite.config.ts
git commit -m "feat: Vercel serverless function + build config"
```

---

## Task 4: Deploy docs + storage-narrative alignment

Documents how the user deploys, and updates the few places whose prose claims disk folders / atomic temp-then-rename (now an in-memory store).

**Files:**
- Modify: `README.md`
- Modify: `docs/02-architecture.md`
- Modify: `docs/04-tee-stream-and-cache.md`
- Modify: `web/src/pages/DeepDivePage.tsx`

**Interfaces:** none.

- [ ] **Step 1: Add a "Deploy to Vercel" section to `README.md`**

Add, after the local run instructions, a plain-English section:

> ## Deploy to Vercel (free)
>
> This repo is configured for Vercel's Hobby tier out of the box (`vercel.json`): the React app is served static and the Hono API runs as a single Node serverless function.
>
> **Option A — Git:** push this repo to GitHub/GitLab, then in the Vercel dashboard "Add New → Project" and import it. Vercel reads `vercel.json` (install `bun install`, build `bun run build`, output `web/dist`, API under `/api`). No environment variables are required.
>
> **Option B — CLI:** `npm i -g vercel`, then from the repo root run `vercel` (preview) or `vercel --prod`.
>
> **Smoke test the deployment:** open the URL, select 2–3 assets, click Download all, wait for READY, then click **Open** — a real `assets.zip` should download. Note: the cache HIT indicator only reappears while the serverless instance stays warm (in-memory cache); a cold start shows MISS again, which is expected on the free tier.

- [ ] **Step 2: Align the storage narrative — `docs/02-architecture.md` and `docs/04-tee-stream-and-cache.md`**

Find the passages describing the two local folders (`server/storage/source` / `server/storage/derived`) and the atomic temp-then-rename write, and reword to: the demo keeps its sources bundled in-process and its derived cache in an in-memory map; the read-only-source vs. regenerable-derived split is preserved, and the "a partial ZIP is never mistaken for a hit" guarantee still holds because the cache key is published only after the archive has fully streamed. Do NOT claim real S3/disk buckets. Run `grep -rin -E "temp-then-rename|\.tmp|two local folders|storage/derived|storage/source" docs/ web/src` and reconcile each hit with the in-memory reality (a passage may legitimately describe the original production design as long as it isn't claimed to be what THIS demo runs).

- [ ] **Step 3: Align the deep-dive page — `web/src/pages/DeepDivePage.tsx`**

The tee-builder / signed-links sections reference the storage code. Update the storage-specific excerpt/prose so it matches the in-memory `Storage` (no `openDerivedWrite` temp-file/`rename` claim). Concretely: replace the `CODE_ATOMIC` excerpt's prose/label so it describes "the cache key is set only after the write stream finishes" rather than temp-then-rename; keep the checksum, tee-stream, and signed-link sections (those are unchanged and still accurate). Keep code snippets confined to the Technique/Protocol sections (per the project's plain-English rule elsewhere).

- [ ] **Step 4: Typecheck (the page change compiles)**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 5: Confirm no stale disk claims remain**

Run: `grep -rin -E "temp-then-rename|two local folders|createWriteStream|rename\(" web/src docs README.md`
Expected: no hit asserts that THIS demo writes to disk / renames temp files (matches on unchanged production-design prose are acceptable — review each).

- [ ] **Step 6: Commit**

```bash
git add README.md docs/02-architecture.md docs/04-tee-stream-and-cache.md web/src/pages/DeepDivePage.tsx
git commit -m "docs: Vercel deploy guide + in-memory storage narrative"
```

---

## Self-Review

**Spec coverage:**
- Free Vercel deploy of frontend + real backend → Tasks 1–3 (in-memory store, serverless fn, vercel.json). ✓
- Serverless has no shared disk / cross-instance state → Task 1 (in-memory) + Task 2 (stateless rebuild-from-ids). ✓
- Origin-agnostic signed URLs → Task 2 (relative url + client absolutize + dev proxy). ✓
- `/assets` collision between Vite static assets and the download route → Task 3 Step 4 (`assetsDir: "static"`). ✓
- Keep `bun run dev` working → every task's local-run verification. ✓
- No paid services / no required env vars → in-memory only; key stays a literal. ✓
- Never push/deploy (user's action) → Global Constraints + Task 4 documents it. ✓
- Narrative honesty about in-memory store → Task 4. ✓

**Placeholder scan:** The only "paste verbatim" is the SVG byte copy in Task 1 Step 1 (mechanical, from named files) — not a logic placeholder. All code steps carry concrete code.

**Type consistency:** `SignResult` gains `pathname` (Task 2 Step 1) and is read as `signed.pathname` (Task 2 Step 2). `UrlSignerConfig` loses `baseUrl` (Task 2 Step 1) and is constructed without it in both `server.ts` (Task 2 Step 3) and `app.ts` (Task 3 Step 1). `Storage` constructor becomes arg-less (Task 1) and is called `new Storage()` in both `server.ts` (Task 1 Step 3, then superseded by `app.ts`) and `app.ts` (Task 3 Step 1). `createApp(): Hono` defined in Task 3 Step 1, consumed by `server.ts` (Task 3 Step 2) and `api/index.ts` (Task 3 Step 3). `downloadUrl` (relative, with `ids`) produced in Task 2 Step 2, absolutized in Task 2 Step 4. No dangling references.
