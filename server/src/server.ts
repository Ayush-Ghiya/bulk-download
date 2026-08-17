import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { Catalog } from "./catalog.ts";
import { registerRoutes } from "./routes.ts";
import { UrlSigner } from "./signer.ts";
import { Storage } from "./storage.ts";
import { ZipArchiveBuilder } from "./zip-archive-builder.ts";

const PORT = 3001;
const SECURITY_KEY = "demo-security-key"; // demo-only
const TENANT_ID = "demo-tenant";

const sourceDir = join(import.meta.dir, "..", "storage", "source");
const derivedDir = join(import.meta.dir, "..", "storage", "derived");
mkdirSync(derivedDir, { recursive: true });

const storage = new Storage({ sourceDir, derivedDir });
const catalog = new Catalog(storage);
const signer = new UrlSigner({
  securityKey: SECURITY_KEY,
  baseUrl: `http://localhost:${PORT}`,
  tenantId: TENANT_ID,
});
const builder = new ZipArchiveBuilder(storage);

const app = new Hono();
app.use("*", cors());
app.get("/health", (c) => c.text("ok"));
registerRoutes(app, { catalog, storage, signer, builder });

export default { port: PORT, fetch: app.fetch };

console.log(`server listening on http://localhost:${PORT}`);
