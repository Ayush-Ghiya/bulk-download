import type React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { ArchitectureDiagram } from "@/components/deepdive/ArchitectureDiagram";
import { CodeBlock } from "@/components/deepdive/CodeBlock";
import { FLOW_STAGES, STEP_LABELS, type FlowStep } from "@/lib/flowStages";

/* ------------------------------------------------------------------ *
 * Section header — mirrors DemoPage's `SectionHeader` so both pages
 * read as one system (mono eyebrow `NN · LABEL` over a text-lg title).
 * ------------------------------------------------------------------ */
function SectionHeader({
  index,
  label,
  title,
  children,
}: {
  index: string;
  label: string;
  title: string;
  children?: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          {index} · {label}
        </span>
        <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Term({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">
      {children}
    </code>
  );
}

interface SseRow {
  event: string;
  payload: string;
  meaning: string;
}

const SSE_ROWS: SseRow[] = [
  { event: "browser", payload: "{ message }", meaning: "Request leaves the browser — pacing only, no network hop." },
  { event: "bff", payload: "{ message }", meaning: "Stands in for the dashboard BFF proxy hop." },
  { event: "resolve", payload: "{ resolved, requested }", meaning: "catalog.findByIds ran; counts of resolved vs requested IDs." },
  { event: "payload-write", payload: "{ checksum, key }", meaning: "payload.json written to the derived store for this checksum." },
  { event: "sign", payload: "{ expiresAt }", meaning: "The signed download URL was minted." },
  { event: "cdn", payload: "{ message }", meaning: "Stands in for the CDN edge hop." },
  { event: "origin-verify", payload: "{ verified }", meaning: "Independent signer.verify() of the just-minted URL." },
  { event: "cache-check", payload: "{ hit }", meaning: "existsDerived result — drives the HIT/MISS branch." },
  { event: "build", payload: "{ name, index, total }", meaning: "One per entry as it is appended. MISS only." },
  { event: "tee", payload: "{ message }", meaning: "Once, after the archive fully drains to client + cache. MISS only." },
  { event: "done", payload: "{ downloadUrl, checksum, cacheHit, expiresAt }", meaning: "Terminal success. Closes the stream." },
  { event: "error", payload: "{ message }", meaning: "Terminal failure — no valid assets, or a caught exception. Closes the stream." },
];

/* ------------------------------------------------------------------ *
 * Real, verbatim excerpts from the server source (kept short).
 * ------------------------------------------------------------------ */
const CODE_CHECKSUM = `get checksum(): string {
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
}`;

const CODE_KEYS = `static payloadKey(checksum: string): string {
  return \`bulk-download/\${checksum}/payload.json\`;
}
static archiveKey(checksum: string): string {
  return \`bulk-download/\${checksum}/download.zip\`;
}`;

const CODE_BUILD = `build(archive: BulkDownloadArchive, progress?: BuildProgress): Readable {
  const zip = archiver("zip", { store: true });
  const toClient = new PassThrough();
  const toCache = new PassThrough();

  zip.pipe(toClient);
  zip.pipe(toCache);

  zip.on("error", (err) => {
    toClient.destroy(err);
    toCache.destroy(err);
  });
  toClient.on("error", () => zip.destroy());
  toCache.on("error", () => {}); // cache is best-effort

  void this.cache(zip, toCache, archive.checksum, progress);
  void this.writeEntries(zip, archive.entries, progress);

  return toClient;
}`;

const CODE_CACHE = `try {
  progress?.onCacheStart?.();
  const { stream, done } = await this.storage.openDerivedWrite(key);
  body.pipe(stream);
  await done;
} catch {
  // Best-effort: detach the cache branch so the client
  // download still completes even when caching fails.
  zip.unpipe(body);
  body.destroy();
}`;

const CODE_ATOMIC = `const finalPath = this.derivedPath(key);
const tmpPath = \`\${finalPath}.tmp\`;
await mkdir(dirname(finalPath), { recursive: true });
const stream = createWriteStream(tmpPath);
const done = new Promise<void>((resolve, reject) => {
  stream.on("error", reject);
  stream.on("finish", () => {
    rename(tmpPath, finalPath).then(resolve, reject);
  });
});
return { stream, done };`;

const CODE_TOKEN = `private fullPathname(contentPath: string): string {
  const path = contentPath.startsWith("/") ? contentPath : \`/\${contentPath}\`;
  return encodeURI(\`/assets/\${this.tenantId}\${path}\`);
}

private token(pathname: string, expires: number): string {
  return createHmac("sha256", this.securityKey)
    .update(\`\${pathname}\\n\${expires}\`)
    .digest("base64url");
}`;

const CODE_VERIFY = `verify(pathname: string, token: string, expires: number): boolean {
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(expires) || now > expires) return false;
  let normalized: string;
  try {
    normalized = encodeURI(decodeURI(pathname));
  } catch {
    return false; // malformed percent-encoding fails closed
  }
  const expected = this.token(normalized, expires);
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}`;

const CODE_ROUTE = `app.get("/assets/:tenantId/download-all/:checksum/:zipName", async (c) => {
  const checksum = c.req.param("checksum");
  // ...
  if (!CHECKSUM.test(checksum)) return c.text("Unknown checksum", 404);

  const pathname = new URL(c.req.url).pathname;
  if (!signer.verify(pathname, token, expires)) {
    return c.text("Invalid or expired token", 401);
  }
  // Only after verifying: load payload.json, then serve or build.
  const cached = await storage.readDerived(archiveKey);
  const body = cached ? Readable.from(cached) : builder.build(archive);
  // ...
});`;

const CODE_SSE = `const send = (event: string, data: unknown) =>
  s.writeSSE({ event, data: JSON.stringify(data) });
// ...
const hit = await storage.existsDerived(archiveKey);
await send("cache-check", { hit });

if (hit) {
  await send("done", { downloadUrl: signed.url, checksum, cacheHit: true, ... });
  return; // HIT short-circuit: no build / tee events are ever sent
}
// MISS: build + tee-cache now so the later download is a real HIT.`;

export function DeepDivePage(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-14">
      {/* Page header */}
      <header className="flex flex-col gap-4 border-b border-border pb-10">
        <Link
          to="/"
          className="flex w-fit items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3" />
          Back to the live demo
        </Link>
        <span className="w-fit rounded-full border border-border bg-card/60 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          Deep dive · how it really works
        </span>
        <h1 className="max-w-3xl text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl">
          One selection, a deterministic checksum, and a ZIP that streams to two
          places at once.
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          The demo runs as a single Bun/Hono service, but every stage mirrors the Media
          Library's real distributed &ldquo;Download All&rdquo; flow. This page walks the
          whole pipeline end to end — the content-addressed cache, the tee-streaming
          archive builder, and the HMAC-signed expiring links — grounded in the exact
          code that ships in <Term>server/src/</Term>.
        </p>
      </header>

      {/* 01 — Architecture */}
      <section className="flex flex-col gap-5">
        <SectionHeader index="01" label="Topology" title="The production architecture" />
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          First the dashboard asks the server to prepare the download over a
          streaming connection — the server resolves the selection, saves a
          record of it, and signs a link (lane A). Then the browser opens
          that link as a second request, and the server re-verifies it and
          either serves a cached archive or builds one (lane B). The
          streaming connection never carries the ZIP itself — only progress
          updates.
        </p>
        <div className="edge-glow relative overflow-hidden rounded-2xl border border-border bg-card/60 p-4 shadow-2xl shadow-black/40 sm:p-8">
          <ArchitectureDiagram />
        </div>
        <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">
          The two &ldquo;buckets&rdquo; are two local folders — read-only
          originals and regenerable payloads/archives — the same
          read-only-vs-derived split two S3 buckets would give you.
        </p>
      </section>

      {/* 02 — Phase by phase */}
      <section className="flex flex-col gap-5">
        <SectionHeader index="02" label="Pipeline" title="Phase by phase" />
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          The flow is two HTTP requests. First the browser asks the server to prepare a
          download and gets back a signed link; then it opens that link to actually
          receive the ZIP. Here is every phase of both, in order.
        </p>
        <div className="flex flex-col gap-8">
          {([1, 2] as FlowStep[]).map((step) => (
            <div key={step} className="flex flex-col gap-3">
              <div className="flex flex-col gap-0.5">
                <h3 className="text-sm font-semibold text-foreground">
                  {STEP_LABELS[step].title}
                </h3>
                <p className="text-xs text-muted-foreground">{STEP_LABELS[step].caption}</p>
              </div>
              <ol className="flex flex-col gap-3">
                {FLOW_STAGES.filter((s) => s.step === step).map((stage) => {
                  const n = FLOW_STAGES.indexOf(stage) + 1;
                  return (
                    <li
                      key={stage.id}
                      className="rounded-xl border border-border bg-card p-4 sm:p-5"
                    >
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-secondary font-mono text-[11px] font-semibold text-foreground">
                          {n}
                        </span>
                        <span className="text-sm font-semibold text-foreground">{stage.node}</span>
                        <span className="font-mono text-[11px] text-muted-foreground">{stage.label}</span>
                      </div>
                      <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
                        {stage.description}
                      </p>
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </div>
      </section>

      {/* 03 — Content-addressed cache */}
      <section className="flex flex-col gap-5">
        <SectionHeader index="03" label="Technique" title="The content-addressed, idempotent cache" />
        <div className="grid gap-6 lg:grid-cols-[1.05fr_1fr] lg:items-start">
          <div className="flex flex-col gap-4 text-sm leading-relaxed text-muted-foreground">
            <p>
              The whole cache turns on one idea: an archive is fully described by
              <Term>{"{ tenantId, zipName, entries }"}</Term>, and the SHA-256 of that
              description <span className="text-foreground">is</span> its identity. The
              same selection always hashes to the same checksum, so the second request for
              a selection is a pure cache HIT rather than a rebuild.
            </p>
            <ul className="flex flex-col gap-2.5">
              <li>
                <span className="text-foreground">Every output-affecting field is in the hash.</span>{" "}
                <Term>tenantId</Term> and <Term>zipName</Term> change the archive (scoping,
                the <Term>Content-Disposition</Term> filename) even when file bytes don't,
                so both are hashed. Each entry contributes <Term>assetId</Term>,{" "}
                <Term>sourceKey</Term>, <Term>entryName ?? null</Term>, and <Term>bytes</Term>.
              </li>
              <li>
                <span className="text-foreground">Order is significant.</span> Entries are
                hashed as an array in the caller's order (deduped first-occurrence by{" "}
                <Term>findByIds</Term>). Requesting <Term>[A, B]</Term> vs <Term>[B, A]</Term>{" "}
                yields two checksums and two cached archives — matching how a real ZIP's
                directory order can matter downstream.
              </li>
              <li>
                <span className="text-foreground">bytes catches stale sources.</span>{" "}
                Captured at catalog-build time; if a source file's size changes on disk the
                next request gets a <span className="text-foreground">different</span>{" "}
                checksum and correctly misses the stale entry.
              </li>
            </ul>
            <p>
              That checksum then names both derived objects. Writing{" "}
              <Term>payload.json</Term> on <span className="text-foreground">every</span>{" "}
              request — hit or miss — is deliberate: the bytes are a pure function of the
              checksum, so re-writing is a harmless no-op, and it means the serve route can
              rebuild the <Term>BulkDownloadArchive</Term> from disk without the stream's
              in-memory state. The payload <span className="text-foreground">is</span> the
              durable record of what a checksum means.
            </p>
          </div>
          <div className="flex flex-col gap-4">
            <CodeBlock
              file="server/src/bulk-download.ts"
              code={CODE_CHECKSUM}
              note="The canonical form serializes entries as fixed-order tuples, not objects — so key ordering in the source can never perturb the hash."
            />
            <CodeBlock file="server/src/bulk-download.ts" code={CODE_KEYS} />
          </div>
        </div>
      </section>

      {/* 04 — Tee-streaming builder */}
      <section className="flex flex-col gap-5">
        <SectionHeader index="04" label="Technique" title="The tee-streaming ZIP builder" />
        <div className="grid gap-6 lg:grid-cols-[1fr_1.05fr] lg:items-start">
          <div className="flex flex-col gap-4">
            <CodeBlock
              file="server/src/zip-archive-builder.ts"
              code={CODE_BUILD}
              note="One archiver, two PassThroughs. Node's backpressure means the archiver only produces as fast as its slowest consumer drains — nothing buffers the whole archive in memory."
            />
            <CodeBlock
              file="server/src/zip-archive-builder.ts · cache()"
              code={CODE_CACHE}
            />
          </div>
          <div className="flex flex-col gap-4 text-sm leading-relaxed text-muted-foreground">
            <p>
              On a miss the ZIP is generated <span className="text-foreground">once</span>{" "}
              and piped to two sinks simultaneously — the client download and the derived
              cache. The first requester pays the build cost; everyone after them gets the
              cached object.
            </p>
            <ul className="flex flex-col gap-2.5">
              <li>
                <span className="text-foreground">Store mode, not compression.</span>{" "}
                <Term>archiver("zip", {"{ store: true }"})</Term> skips per-entry
                compression — images and video are already compressed, so it buys little,
                and store mode lets the archiver behave as a near-transparent pass-through.
              </li>
              <li>
                <span className="text-foreground">Missing sources are skipped, not fatal.</span>{" "}
                <Term>openSource()</Term> calls <Term>statSync()</Term> first so a missing
                file throws <span className="text-foreground">synchronously</span> and the
                loop can <Term>continue</Term>, instead of surfacing later as a stream error
                that tears down the whole archive.
              </li>
              <li>
                <span className="text-foreground">Caching never fails the download.</span>{" "}
                The cache branch's <Term>error</Term> listener is a no-op; if opening the
                cache write throws, the builder just detaches that branch and the client
                stream continues. Only the client branch is load-bearing.
              </li>
            </ul>
            <p>
              And a partial ZIP is never mistaken for a HIT: the cache writes to{" "}
              <Term>download.zip.tmp</Term> and only <Term>rename()</Term>s to the real path
              after the stream fully finishes. Since <Term>existsDerived()</Term> just{" "}
              <Term>stat()</Term>s the final path — and same-filesystem <Term>rename</Term>{" "}
              is atomic — a reader either sees a complete archive or nothing at all.
            </p>
            <CodeBlock
              file="server/src/storage.ts · openDerivedWrite()"
              code={CODE_ATOMIC}
            />
          </div>
        </div>
      </section>

      {/* 05 — Signed links */}
      <section className="flex flex-col gap-5">
        <SectionHeader index="05" label="Technique" title="HMAC-signed, expiring links" />
        <div className="grid gap-6 lg:grid-cols-[1.05fr_1fr] lg:items-start">
          <div className="flex flex-col gap-4 text-sm leading-relaxed text-muted-foreground">
            <p>
              The archive endpoint serves whatever is in the derived store, so it needs
              authorization and expiry. The scheme is deliberately minimal:
            </p>
            <div className="rounded-lg border border-border/70 bg-muted/40 p-3 font-mono text-[12px] leading-relaxed text-foreground">
              token = base64url( HMAC-SHA256( key, pathname + &quot;\n&quot; + expires ) )
            </div>
            <ul className="flex flex-col gap-2.5">
              <li>
                <span className="text-foreground">The percent-encoded pathname is signed</span>
                {" "}— <Term>encodeURI(/assets/{"{tenantId}"}/download-all/…)</Term> — so a{" "}
                <Term>zipName</Term> with spaces is signed over exactly the bytes that travel
                on the wire. <Term>verify()</Term> round-trips through <Term>decodeURI</Term>{" "}
                then <Term>encodeURI</Term> so equivalent escapings still match.
              </li>
              <li>
                <span className="text-foreground">expires is appended after a literal newline</span>
                {" "}so path and timestamp can't be concatenated ambiguously, and it's an
                absolute Unix timestamp — no clock-skew bookkeeping between sign and verify.
              </li>
              <li>
                <span className="text-foreground">5-day default, 7-day hard cap.</span>{" "}
                <Term>sign()</Term> clamps any requested lifetime into{" "}
                <Term>[1, MAX_EXPIRES_IN]</Term>.
              </li>
              <li>
                <span className="text-foreground">verify() fails closed</span> on a
                non-finite <Term>expires</Term>, a broken percent-encoding, or a
                length-mismatched token — and uses <Term>timingSafeEqual</Term> for the
                comparison itself.
              </li>
            </ul>
            <p className="rounded-lg border border-border/70 bg-muted/40 p-3 text-xs">
              <span className="text-foreground">Route shape.</span> The real route is{" "}
              <Term>/assets/:tenantId/download-all/:checksum/:zipName</Term>. There is no bare{" "}
              <Term>/download-all/…</Term> route — that string only ever appears as the{" "}
              <span className="text-foreground">content path</span> handed to the signer
              before it gets the <Term>/assets/{"{tenantId}"}</Term> prefix. The origin
              re-verifies independently of the stream's own <Term>origin-verify</Term> step.
            </p>
            <p className="text-xs">
              <span className="text-foreground">Demo-key caveat.</span> The key{" "}
              <Term>demo-security-key</Term> and tenant <Term>demo-tenant</Term> are
              hardcoded literals so the demo runs with zero setup. In production the key is a
              rotated per-tenant secret from a secrets store — never a source literal.
            </p>
          </div>
          <div className="flex flex-col gap-4">
            <CodeBlock file="server/src/signer.ts" code={CODE_TOKEN} />
            <CodeBlock file="server/src/signer.ts · verify()" code={CODE_VERIFY} />
            <CodeBlock file="server/src/routes.ts" code={CODE_ROUTE} />
          </div>
        </div>
      </section>

      {/* 06 — SSE protocol */}
      <section className="flex flex-col gap-5">
        <SectionHeader index="06" label="Protocol" title="The SSE stage protocol" />
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          The mint request is a Hono <Term>streamSSE</Term> handler. Each stage is one
          named event with a JSON body, emitted strictly in order. The connection is
          one-shot: it runs the whole lifecycle for a single click, then sends{" "}
          <Term>done</Term> or <Term>error</Term> and closes — the browser opens a fresh{" "}
          <Term>EventSource</Term> per download.
        </p>
        <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr] lg:items-start">
          <CodeBlock
            file="server/src/routes.ts · GET /api/bulk-download/stream"
            code={CODE_SSE}
            note="On a HIT the sequence short-circuits after cache-check — no build or tee events are ever sent, and the client hook marks those two stages skipped rather than done."
          />
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[520px] border-collapse text-left">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-3 py-2.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Event</th>
                  <th className="px-3 py-2.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Payload</th>
                  <th className="px-3 py-2.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Meaning</th>
                </tr>
              </thead>
              <tbody>
                {SSE_ROWS.map((row) => (
                  <tr key={row.event} className="border-b border-border/60 last:border-0 align-top">
                    <td className="px-3 py-2.5 font-mono text-[12px] text-foreground">{row.event}</td>
                    <td className="px-3 py-2.5 font-mono text-[10.5px] text-muted-foreground">{row.payload}</td>
                    <td className="px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">{row.meaning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Closing cross-link */}
      <section className="edge-glow flex flex-col items-start gap-3 rounded-2xl border border-border bg-card/60 p-8 shadow-2xl shadow-black/40">
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          Now watch it run
        </span>
        <h2 className="max-w-2xl text-lg font-semibold tracking-tight text-foreground">
          Every phase above lights up live on the demo page — including the HIT
          short-circuit when you re-request the same selection.
        </h2>
        <Link
          to="/"
          className="glow mt-1 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-transform hover:scale-[1.02]"
        >
          <ArrowLeft className="size-4" />
          Back to the live demo
        </Link>
      </section>
    </div>
  );
}
