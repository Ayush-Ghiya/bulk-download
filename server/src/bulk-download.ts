import { createHash } from "node:crypto";

/** A single file to include in the archive. Plain data — no behavior. */
export interface BulkDownloadEntry {
  assetId: string;
  sourceKey: string;
  entryName?: string;
  bytes: number;
}

export interface ArchiveProps {
  tenantId: string;
  zipName: string;
  entries: BulkDownloadEntry[];
}

export class BulkDownloadArchive {
  static readonly PREFIX = "bulk-download";

  readonly props: ArchiveProps;

  constructor(props: ArchiveProps) {
    this.props = props;
  }

  static payloadKey(checksum: string): string {
    return `${BulkDownloadArchive.PREFIX}/${checksum}/payload.json`;
  }

  static archiveKey(checksum: string): string {
    return `${BulkDownloadArchive.PREFIX}/${checksum}/download.zip`;
  }

  static parsePayload(buf: Buffer): BulkDownloadArchive | null {
    let raw: unknown;
    try {
      raw = JSON.parse(buf.toString("utf8"));
    } catch {
      return null;
    }
    if (!raw || typeof raw !== "object") return null;
    const o = raw as Record<string, unknown>;
    if (
      typeof o.tenantId !== "string" ||
      typeof o.zipName !== "string" ||
      !Array.isArray(o.entries)
    ) {
      return null;
    }
    const entries: BulkDownloadEntry[] = [];
    for (const item of o.entries) {
      if (!item || typeof item !== "object") continue;
      const e = item as Record<string, unknown>;
      if (
        typeof e.assetId !== "string" ||
        typeof e.sourceKey !== "string" ||
        typeof e.bytes !== "number"
      ) {
        continue;
      }
      entries.push({
        assetId: e.assetId,
        sourceKey: e.sourceKey,
        bytes: e.bytes,
        ...(typeof e.entryName === "string" && { entryName: e.entryName }),
      });
    }
    return new BulkDownloadArchive({
      tenantId: o.tenantId,
      zipName: o.zipName,
      entries,
    });
  }

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

  get zipName(): string {
    return this.props.zipName;
  }

  get entries(): BulkDownloadEntry[] {
    return this.props.entries;
  }

  toJSON(): ArchiveProps {
    return this.props;
  }
}
