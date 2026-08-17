import type { Storage } from "./storage.ts";

export interface CatalogAsset {
  id: string;
  name: string;
  sourceKey: string;
  contentType: string;
  bytes: number;
}

interface SeedAsset {
  id: string;
  name: string;
  sourceKey: string;
  contentType: string;
}

const SEED: SeedAsset[] = [
  { id: "a-mountains", name: "mountains.svg", sourceKey: "mountains.svg", contentType: "image/svg+xml" },
  { id: "a-ocean", name: "ocean.svg", sourceKey: "ocean.svg", contentType: "image/svg+xml" },
  { id: "a-desert", name: "desert.svg", sourceKey: "desert.svg", contentType: "image/svg+xml" },
  { id: "a-forest", name: "forest.svg", sourceKey: "forest.svg", contentType: "image/svg+xml" },
];

export class Catalog {
  private readonly assets: CatalogAsset[];

  constructor(storage: Storage) {
    this.assets = SEED.map((s) => ({
      ...s,
      bytes: storage.sourceBytes(s.sourceKey),
    }));
  }

  list(): CatalogAsset[] {
    return this.assets;
  }

  findByIds(ids: string[]): CatalogAsset[] {
    const byId = new Map(this.assets.map((a) => [a.id, a]));
    const seen = new Set<string>();
    const out: CatalogAsset[] = [];
    for (const id of ids) {
      if (seen.has(id)) continue;
      const asset = byId.get(id);
      if (!asset) continue;
      seen.add(id);
      out.push(asset);
    }
    return out;
  }
}
