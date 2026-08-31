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

const storage = new Storage();
const catalog = new Catalog(storage);
const signer = new UrlSigner({
  securityKey: SECURITY_KEY,
  tenantId: TENANT_ID,
});
const builder = new ZipArchiveBuilder(storage);

const app = new Hono();
app.use("*", cors());
app.get("/health", (c) => c.text("ok"));
registerRoutes(app, { catalog, storage, signer, builder });

export default { port: PORT, fetch: app.fetch };

console.log(`server listening on http://localhost:${PORT}`);
