import { Hono } from "hono";
import { cors } from "hono/cors";
import { Catalog } from "./catalog.js";
import { registerRoutes } from "./routes.js";
import { UrlSigner } from "./signer.js";
import { Storage } from "./storage.js";
import { ZipArchiveBuilder } from "./zip-archive-builder.js";

const SECURITY_KEY = "demo-security-key"; // demo-only
const TENANT_ID = "demo-tenant";

/**
 * Build a fresh Hono app with its own in-memory storage. Called once per
 * process (Bun locally) or once per warm serverless instance (Vercel), so
 * the derived cache persists for that instance's lifetime.
 */
export function createApp(): Hono {
  const storage = new Storage();
  const catalog = new Catalog(storage);
  const signer = new UrlSigner({ securityKey: SECURITY_KEY, tenantId: TENANT_ID });
  const builder = new ZipArchiveBuilder(storage);

  const app = new Hono();
  app.use("*", cors());
  app.get("/health", (c) => c.text("ok"));
  registerRoutes(app, { catalog, storage, signer, builder });
  return app;
}
