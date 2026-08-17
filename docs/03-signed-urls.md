# 03 — Signed URLs

Source: `server/src/signer.ts`, consumed by `server/src/routes.ts` and
`server/src/server.ts`.

## Why sign at all

The archive endpoint serves whatever is in `server/storage/derived/`. Without
some form of authorization, anyone who could guess a checksum could download
the archive, and there'd be no way to make a link expire. A signed,
expiring URL solves both: only a link minted by the server (holder of the
`securityKey`) is accepted, and it stops working after `expires`.

## Link shape

A signed link looks like:

```
http://localhost:3001/assets/demo-tenant/download-all/{checksum}/{zipName}?token={token}&expires={expires}
```

- `demo-tenant` is the hardcoded `tenantId` (`TENANT_ID` in both
  `server/src/server.ts` and `server/src/routes.ts`).
- `{checksum}` is the archive's SHA-256 content hash (see
  [`04-tee-stream-and-cache.md`](04-tee-stream-and-cache.md)).
- `{zipName}` is the user-supplied archive filename (defaults to
  `assets.zip`; can contain spaces).
- `token` and `expires` are query parameters, not part of the signed path
  itself — but both feed into the signature (see below).

This is built in two steps:

1. `bulkDownloadContentPath(checksum, zipName)` returns the *content* path,
   `/download-all/{checksum}/{zipName}` — this is the path the signer is
   asked to sign.
2. `UrlSigner.sign()` (via its private `fullPathname()`) prefixes that with
   `/assets/{tenantId}` and percent-encodes the whole thing with
   `encodeURI(...)`, giving the final pathname that both the token
   signature and the actual HTTP route are computed over:
   `/assets/demo-tenant/download-all/{checksum}/{zipName}`.

The server's actual route registration matches this exactly:
`app.get("/assets/:tenantId/download-all/:checksum/:zipName", ...)` in
`server/src/routes.ts`. There is no bare `/download-all/...` route — that
string only ever appears as the *content path* passed into the signer before
it gets the `/assets/{tenantId}` prefix.

## Token scheme

```
token = base64url( HMAC-SHA256( securityKey, pathname + "\n" + expires ) )
```

Concretely (`UrlSigner.token()`):

```ts
createHmac("sha256", this.securityKey)
  .update(`${pathname}\n${expires}`)
  .digest("base64url");
```

- `pathname` is the full, percent-encoded path (`/assets/demo-tenant/download-all/...`), **not** just the checksum or zip name.
- `expires` is a Unix timestamp (seconds), appended after a literal newline so the two fields can't be concatenated ambiguously.
- The digest is base64url-encoded so it's URL-safe without additional escaping.

### Why the percent-encoded pathname is signed

`zipName` is user-supplied and can contain spaces or other characters that
need percent-encoding to survive as a URL path segment (e.g. `My Photos.zip`
becomes `My%20Photos.zip`). Signing the *encoded* form — rather than the raw
string — means the signature is computed over exactly the bytes that travel
on the wire, so there's no ambiguity between "sign this before encoding" and
"sign this after encoding" that a client or proxy could exploit by
re-encoding the path differently. `verify()` re-derives this defensively: it
round-trips the incoming pathname through `decodeURI` then `encodeURI` before
recomputing the expected token, so semantically-equivalent but
differently-escaped paths still verify, while a malformed percent-encoding
fails closed (see below).

## Expiry

- `DEFAULT_EXPIRES_IN = 5 * DAY` (5 days) — used when the caller doesn't
  request a specific lifetime.
- `MAX_EXPIRES_IN = 7 * DAY` (7 days) — a hard cap; `sign()` clamps any
  requested `expiresIn` into `[1, MAX_EXPIRES_IN]` via
  `Math.min(Math.max(Math.floor(requested), 1), MAX_EXPIRES_IN)`.
- `expires` is stored as an absolute Unix timestamp (`now + expiresIn`), not
  a duration, so `verify()` just compares it against the current time —
  no clock-skew bookkeeping between sign and verify.

## What the origin re-verifies

The download route (`GET /assets/:tenantId/download-all/:checksum/:zipName`
in `server/src/routes.ts`) does **not** trust that a link reaching it is
valid just because it was signed once upstream. It:

1. Rejects any `checksum` that doesn't match `/^[a-f0-9]{64}$/` with 404
   before touching storage.
2. Recomputes the pathname from the actual incoming request URL
   (`new URL(c.req.url).pathname`) — not from a header or from the
   `payload.json` on disk — and calls `signer.verify(pathname, token,
   expires)`. A mismatched token, expired timestamp, or tampered path
   returns `401 Invalid or expired token`.
3. Only after verification does it load `payload.json` for the checksum and
   serve (or build) the archive.

This mirrors the "origin re-verifies" stage in
[`02-architecture.md`](02-architecture.md): even though the SSE flow already
did its own `origin-verify` step for the flow widget's benefit, the actual
download route performs an independent verification of whatever request
lands on it, using the same key.

`verify()` also fails closed on malformed input: it validates `expires` is
finite before comparing to `now`, catches `decodeURI` throwing on a broken
percent-encoding, and compares token lengths before doing a
`timingSafeEqual` (mismatched lengths return `false` immediately rather than
throwing or leaking timing information from a length-mismatched buffer
compare).

## Demo-key caveat

`server/src/server.ts` hardcodes:

```ts
const SECURITY_KEY = "demo-security-key"; // demo-only
const TENANT_ID = "demo-tenant";
```

In production this key would be a per-tenant secret pulled from a secrets
store, rotated periodically, and never checked into source. Here it's a
fixed literal so the demo is reproducible without any setup — there is
exactly one tenant and one key, and both are visible in the source. Don't
reuse this pattern for anything that isn't a local demo.

## Next

- [`04-tee-stream-and-cache.md`](04-tee-stream-and-cache.md) — what the signed link ultimately points at.
- [`05-sse-flow.md`](05-sse-flow.md) — where `sign` and `origin-verify` fit in the live progress stream.
- Back to [`02-architecture.md`](02-architecture.md) · [`01-overview.md`](01-overview.md).
