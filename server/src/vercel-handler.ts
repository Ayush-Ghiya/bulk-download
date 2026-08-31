// Vercel runs this function on the Node.js runtime (required for archiver +
// Node streams), so it receives Node's (req, res) objects — NOT a Web Request.
// hono/vercel's handle is Edge-only (it calls app.fetch(req) expecting a Web
// Request, so req.headers.get blows up on Node). @hono/node-server/vercel is
// the Node adapter that bridges Node req/res <-> Hono. Re-exported from inside
// the server workspace where the dependency resolves.
export { handle } from "@hono/node-server/vercel";
