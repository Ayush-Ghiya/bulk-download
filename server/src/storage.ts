import { createReadStream, createWriteStream, statSync } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface StorageConfig {
  sourceDir: string;
  derivedDir: string;
}

export class Storage {
  private readonly sourceDir: string;
  private readonly derivedDir: string;

  constructor(config: StorageConfig) {
    this.sourceDir = config.sourceDir;
    this.derivedDir = config.derivedDir;
  }

  private derivedPath(key: string): string {
    return join(this.derivedDir, key);
  }

  private sourcePath(sourceKey: string): string {
    return join(this.sourceDir, sourceKey);
  }

  async readDerived(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.derivedPath(key));
    } catch {
      return null;
    }
  }

  async writeDerived(key: string, body: Buffer): Promise<void> {
    const path = this.derivedPath(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
  }

  async existsDerived(key: string): Promise<boolean> {
    try {
      await stat(this.derivedPath(key));
      return true;
    } catch {
      return false;
    }
  }

  async openDerivedWrite(
    key: string,
  ): Promise<{ stream: NodeJS.WritableStream; done: Promise<void> }> {
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

  openSource(sourceKey: string): NodeJS.ReadableStream {
    return createReadStream(this.sourcePath(sourceKey));
  }

  sourceBytes(sourceKey: string): number {
    return statSync(this.sourcePath(sourceKey)).size;
  }
}
