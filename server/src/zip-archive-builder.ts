import { once } from "node:events";
import { PassThrough, type Readable } from "node:stream";
import archiver from "archiver";
import {
  BulkDownloadArchive,
  type BulkDownloadEntry,
} from "./bulk-download";
import type { Storage } from "./storage";

export interface BuildProgress {
  onEntry?(name: string, index: number, total: number): void;
  onCacheStart?(): void;
}

function basename(key: string): string {
  const slash = key.lastIndexOf("/");
  return slash >= 0 ? key.slice(slash + 1) : key;
}

export class ZipArchiveBuilder {
  private readonly storage: Storage;

  constructor(storage: Storage) {
    this.storage = storage;
  }

  build(archive: BulkDownloadArchive, progress?: BuildProgress): Readable {
    const zip = archiver("zip", { store: true });
    const toClient = new PassThrough();
    const toCache = new PassThrough();

    zip.pipe(toClient);
    zip.pipe(toCache);

    zip.on("error", (err) => {
      toClient.destroy(err);
      toCache.destroy(err);
    });
    // Both PassThroughs need an 'error' listener: an unlistened 'error'
    // event (e.g. from destroy(err)) is an uncaught exception in Node.
    toClient.on("error", () => zip.destroy());
    toCache.on("error", () => {}); // cache is best-effort

    void this.cache(zip, toCache, archive.checksum, progress);
    void this.writeEntries(zip, archive.entries, progress);

    return toClient;
  }

  private async cache(
    zip: archiver.Archiver,
    body: PassThrough,
    checksum: string,
    progress?: BuildProgress,
  ): Promise<void> {
    const key = BulkDownloadArchive.archiveKey(checksum);
    try {
      progress?.onCacheStart?.();
      const { stream, done } = await this.storage.openDerivedWrite(key);
      body.pipe(stream);
      await done;
    } catch {
      // Best-effort: detach the cache branch so the client download still
      // completes even when caching fails.
      zip.unpipe(body);
      body.destroy();
    }
  }

  private async writeEntries(
    zip: archiver.Archiver,
    entries: readonly BulkDownloadEntry[],
    progress?: BuildProgress,
  ): Promise<void> {
    try {
      let i = 0;
      for (const entry of entries) {
        i += 1;
        let source: Readable;
        try {
          source = this.storage.openSource(entry.sourceKey);
        } catch {
          continue; // skip unreadable source
        }
        const name = entry.entryName ?? basename(entry.sourceKey);
        const written = once(zip, "entry");
        zip.append(source, { name });
        progress?.onEntry?.(name, i, entries.length);
        await written;
      }
      await zip.finalize();
    } catch (err) {
      zip.destroy(err instanceof Error ? err : new Error(String(err)));
    }
  }
}
