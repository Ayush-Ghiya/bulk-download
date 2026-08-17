import { Hono } from "hono";

const PORT = 3001;
const app = new Hono();

app.get("/health", (c) => c.text("ok"));

export default { port: PORT, fetch: app.fetch };

console.log(`server listening on http://localhost:${PORT}`);
