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
