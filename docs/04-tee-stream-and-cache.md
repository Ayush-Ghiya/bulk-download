# 04 — Tee-Stream and Cache

This is the centerpiece mechanism the whole demo exists to show. Source:
`server/src/bulk-download.ts` (the archive descriptor + checksum),
`server/src/zip-archive-builder.ts` (the builder), and
`server/src/storage.ts` (atomic cache writes).

## The deterministic checksum

`BulkDownloadArchive` (`server/src/bulk-download.ts`) is a plain value object
— `{ tenantId, zipName, entries }` — with a `checksum` getter:

```ts
get checksum(): string {
  const { tenantId, zipName, entries } = this.props;
  const canonical = JSON.stringify({
    tenantId,
    zipName,
    entries: entries.map((entry) => [
      entry.assetId,
      entry.sourceKey,
      entry.entryName ?? null,
      entry.bytes,
    ]),
  });
  return createHash("sha256").update(canonical).digest("hex");
}
```

Two things make this checksum a reliable cache key:

- **Every field that affects the output is included.** `tenantId` and
  `zipName` are part of the hash even though they don't change file
  *contents*, because they change the *archive* (different tenant scoping,
  different filename in the `Content-Disposition` header users would see).
  Each entry contributes `assetId`, `sourceKey`, `entryName ?? null`, and
  `bytes` — so a renamed entry or a different byte count produces a
  different checksum, not a silent cache collision.
  `bytes` is captured at catalog-build time (`Catalog` reads it via
  `storage.sourceBytes()`), so if a source file's size ever changed on disk,
  the next request for the same asset IDs would get a *different* checksum
  and correctly miss the stale cache entry instead of serving a checksum
  that no longer matches the file.
- **Order is significant.** `entries` is hashed as an array, in the order
  the caller supplied `assetIds` (deduplicated by `Catalog.findByIds`, which
  preserves first-occurrence order). Requesting `[A, B]` and `[B, A]`
  produces two different checksums and two different cached archives, even
  though the file *contents* would be identical — the archive's *entry
  order* is part of what's cached, matching how a real ZIP's directory order
  can matter to downstream tooling.

Because the hash is a pure function of these fields, requesting the exact
same selection and zip name twice always yields the exact same checksum —
which is what makes the cache idempotent rather than just memoizing by
request.

## Idempotent `payload.json` write

Every request — hit or miss — writes `payload.json` unconditionally
(`routes.ts`, `GET /api/bulk-download/stream`):

```ts
await storage.writeDerived(
  BulkDownloadArchive.payloadKey(checksum),
  Buffer.from(JSON.stringify(archive.toJSON()), "utf8"),
);
```

`BulkDownloadArchive.payloadKey(checksum)` is
`bulk-download/{checksum}/payload.json`. Writing it every time — rather than
only on a cache miss — is deliberate and safe: the write is a pure function
of the checksum (same checksum always produces the exact same JSON bytes),
so re-writing it on a hit is a no-op in effect, just wasted I/O. This is what
lets the download route (`GET
/assets/:tenantId/download-all/:checksum/:zipName`) reconstruct the
`BulkDownloadArchive` from disk via `BulkDownloadArchive.parsePayload()`
without needing the original request's in-memory state — the payload *is*
the durable record of what a checksum means.

## The tee: one archiver, two `PassThrough`s

`ZipArchiveBuilder.build()` (`server/src/zip-archive-builder.ts`) is where
the "no buffering everything in memory" property actually comes from:

```ts
build(archive: BulkDownloadArchive, progress?: BuildProgress): Readable {
  const zip = archiver("zip", { store: true });
  const toClient = new PassThrough();
  const toCache = new PassThrough();

  zip.pipe(toClient);
  zip.pipe(toCache);
  ...
  void this.cache(zip, toCache, archive.checksum, progress);
  void this.writeEntries(zip, archive.entries, progress);

  return toClient;
}
```

- `archiver("zip", { store: true })` uses **store mode** — no per-entry
  compression. This is a deliberate tradeoff: images and video are already
  compressed, so spending CPU re-compressing them buys little, and store
  mode lets `archiver` operate as a nearly-transparent pass-through rather
  than needing to buffer for a compression window.
- The single `archiver` instance is piped to **two** `PassThrough` streams.
  Node's stream backpressure means the archiver only produces data as fast
  as its slowest consumer drains — so nothing downstream needs to hold the
  whole archive in memory; both branches see the same bytes as they're
  produced.
- `writeEntries()` walks `archive.entries`, opens each source file with
  `storage.openSource(entry.sourceKey)`, and `zip.append()`s it, waiting for
  the `entry` event before moving to the next file (so entries are added
  serially, but each file itself streams rather than loading fully into
  memory).
- **Missing sources are skipped, not fatal.** `openSource()` calls
  `statSync()` first specifically so a missing file throws synchronously
  and can be caught with a `continue` in `writeEntries()`'s loop, rather
  than surfacing as an async stream `error` later that would tear down the
  whole archive.
- The client branch (`toClient`, returned to the caller) is the one that
  matters for correctness: if it errors, `zip.destroy()` is called, which
  aborts the whole build. The cache branch (`toCache`) is explicitly
  best-effort — its own `error` listener is a no-op, and if opening the
  cache write stream throws, the builder just `zip.unpipe(body)` and
  `body.destroy()`s the cache branch, letting the client download continue
  uninterrupted. **A caching failure never fails the user's download.**

## Atomic temp-then-rename caching

`Storage.openDerivedWrite()` (`server/src/storage.ts`) is what makes the
cache safe to read concurrently with a write in progress:

```ts
async openDerivedWrite(key: string) {
  const finalPath = this.derivedPath(key);
  const tmpPath = `${finalPath}.tmp`;
  await mkdir(dirname(finalPath), { recursive: true });
  const stream = createWriteStream(tmpPath);
  const done = new Promise<void>((resolve, reject) => {
    stream.on("error", reject);
    stream.on("finish", () => {
      rename(tmpPath, finalPath).then(resolve, reject);
    });
  });
  return { stream, done };
}
```

The write goes to `download.zip.tmp`, and only after the stream fully
finishes does a `rename()` move it to the real `download.zip` path. This
matters because `existsDerived()` (used by the cache-check stage) just
`stat()`s the final path — if the builder wrote directly to `download.zip`
and a concurrent request checked for its existence mid-write, it would see
a partial, corrupt file and report a false HIT. With temp-then-rename, the
final path only ever exists once the full archive is written; `rename()`
within the same filesystem is atomic, so there's no window where a reader
could see a partially-written `download.zip`.

## HIT / MISS lifecycle

Putting it together, from `GET /api/bulk-download/stream`:

1. Compute `checksum` from the requested asset IDs + zip name.
2. Write `payload.json` for that checksum (always).
3. Sign a URL for `download-all/{checksum}/{zipName}`.
4. Check `storage.existsDerived(archiveKey)`:
   - **HIT** — the SSE stream emits `done` immediately with `cacheHit:
     true`. No build happens on this request; the client will download the
     already-cached `download.zip` when it follows the signed link.
   - **MISS** — the SSE stream calls `builder.build(archive, ...)`, drains
     the returned stream to completion server-side (so the cache write
     finishes even though the actual bytes aren't sent to the client over
     SSE — SSE only carries progress events, not the archive itself), then
     emits `tee` and `done` with `cacheHit: false`.
5. Independently, whenever the actual download route
   (`/assets/:tenantId/download-all/:checksum/:zipName`) is hit — which may
   be a *different* HTTP request than the SSE stream, since the SSE stream
   only hands back a URL — it re-checks the cache itself: `cached ?
   Readable.from(cached) : builder.build(archive)`. So even if two overlapping
   requests raced past the SSE stream's own cache-check, the download route
   makes its own independent decision on whatever is on disk at the moment
   it runs.

The net effect: the *first* request for a given selection pays the full
build cost (streamed, not buffered); every subsequent request for the exact
same selection — same asset IDs, same order, same zip name — is a cheap
cache read.

## Next

- [`05-sse-flow.md`](05-sse-flow.md) — how this lifecycle is reported to the UI stage-by-stage.
- [`03-signed-urls.md`](03-signed-urls.md) — the link that ultimately triggers a HIT or MISS read.
- Back to [`02-architecture.md`](02-architecture.md) · [`01-overview.md`](01-overview.md).
