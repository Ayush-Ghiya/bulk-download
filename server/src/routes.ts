import { Readable } from "node:stream";
import type { Hono } from "hono";
import { stream } from "hono/streaming";
import { BulkDownloadArchive } from "./bulk-download.ts";
import type { Catalog } from "./catalog.ts";
import { bulkDownloadContentPath, type UrlSigner } from "./signer.ts";
import type { Storage } from "./storage.ts";
import type { ZipArchiveBuilder } from "./zip-archive-builder.ts";

const CHECKSUM = /^[a-f0-9]{64}$/;
const TENANT_ID = "demo-tenant";

export interface RouteDeps {
  catalog: Catalog;
  storage: Storage;
  signer: UrlSigner;
  builder: ZipArchiveBuilder;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function registerRoutes(app: Hono, deps: RouteDeps): void {
  const { catalog, storage, signer, builder } = deps;

  app.get("/api/assets", (c) => {
    const assets = catalog.list().map((a) => ({
      id: a.id,
      name: a.name,
      contentType: a.contentType,
      bytes: a.bytes,
      thumbnailUrl: `/source/${a.sourceKey}`,
    }));
    return c.json({ assets });
  });

  app.get("/source/:file", async (c) => {
    const file = c.req.param("file");
    const asset = catalog.list().find((a) => a.sourceKey === file);
    if (!asset) return c.text("Not found", 404);
    const body = Readable.toWeb(
      storage.openSource(asset.sourceKey) as Readable,
    ) as ReadableStream;
    return new Response(body, {
      headers: { "Content-Type": asset.contentType },
    });
  });

  app.get("/api/bulk-download/stream", (c) => {
    const assetIds = (c.req.query("assetIds") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const zipName = (c.req.query("zipName") ?? "assets.zip").trim() || "assets.zip";

    return stream(c, async (s) => {
      const send = (event: string, data: unknown) =>
        s.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

      try {
        await send("browser", { message: "Request leaves the browser" });
        await sleep(250);
        await send("bff", { message: "Dashboard BFF proxies to the API" });
        await sleep(250);

        const assets = catalog.findByIds(assetIds);
        await send("resolve", { resolved: assets.length, requested: assetIds.length });
        if (assets.length === 0) {
          await send("error", { message: "No valid assets selected" });
          return;
        }
        await sleep(200);

        const entries = assets.map((a) => ({
          assetId: a.id,
          sourceKey: a.sourceKey,
          entryName: a.name,
          bytes: a.bytes,
        }));
        const archive = new BulkDownloadArchive({ tenantId: TENANT_ID, zipName, entries });
        const checksum = archive.checksum;

        await storage.writeDerived(
          BulkDownloadArchive.payloadKey(checksum),
          Buffer.from(JSON.stringify(archive.toJSON()), "utf8"),
        );
        await send("payload-write", { checksum, key: BulkDownloadArchive.payloadKey(checksum) });
        await sleep(200);

        const signed = signer.sign(bulkDownloadContentPath(checksum, zipName));
        await send("sign", { expiresAt: signed.expiresAt });
        await sleep(200);

        await send("cdn", { message: "Signed link travels through the CDN edge" });
        await sleep(250);

        const pathname = new URL(signed.url).pathname;
        const verified = signer.verify(pathname, signed.token, signed.expires);
        await send("origin-verify", { verified });
        await sleep(200);

        const archiveKey = BulkDownloadArchive.archiveKey(checksum);
        const hit = await storage.existsDerived(archiveKey);
        await send("cache-check", { hit });

        if (hit) {
          await send("done", { downloadUrl: signed.url, checksum, cacheHit: true, expiresAt: signed.expiresAt });
          return;
        }

        // MISS: build + tee-cache now so the later download is a real HIT.
        await new Promise<void>((resolve, reject) => {
          const built = builder.build(archive, {
            onEntry: (name, index, total) => {
              void send("build", { name, index, total });
            },
            onCacheStart: () => {
              void send("tee", { message: "Streaming to client and cache at once" });
            },
          });
          built.on("data", () => {});
          built.on("end", resolve);
          built.on("error", reject);
        });

        await send("done", { downloadUrl: signed.url, checksum, cacheHit: false, expiresAt: signed.expiresAt });
      } catch (err) {
        await send("error", { message: err instanceof Error ? err.message : "stream failed" });
      }
    });
  });

  app.get("/assets/:tenantId/download-all/:checksum/:zipName", async (c) => {
    const checksum = c.req.param("checksum");
    const zipName = c.req.param("zipName");
    const token = c.req.query("token") ?? "";
    const expires = Number(c.req.query("expires") ?? "0");

    if (!CHECKSUM.test(checksum)) return c.text("Unknown checksum", 404);

    const pathname = new URL(c.req.url).pathname;
    if (!signer.verify(pathname, token, expires)) {
      return c.text("Invalid or expired token", 401);
    }

    const payload = await storage.readDerived(BulkDownloadArchive.payloadKey(checksum));
    const archive = payload ? BulkDownloadArchive.parsePayload(payload) : null;
    if (!archive) return c.text("Unknown checksum", 404);

    const archiveKey = BulkDownloadArchive.archiveKey(checksum);
    const cached = await storage.readDerived(archiveKey);
    const body = cached
      ? Readable.from(cached)
      : builder.build(archive);

    const webStream = Readable.toWeb(body as Readable) as ReadableStream;
    return new Response(webStream, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${zipName}"`,
      },
    });
  });
}
