import { createApp } from "./app";

const PORT = 3001;
const app = createApp();

export default { port: PORT, fetch: app.fetch };

console.log(`server listening on http://localhost:${PORT}`);
