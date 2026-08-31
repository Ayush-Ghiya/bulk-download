import { createApp } from "../server/src/app";
import { handle } from "../server/src/vercel-handler";

// Runs on Vercel's Node.js runtime (default) — required for archiver and
// Node streams. createApp() runs once at module load; the resulting app's
// in-memory cache lives for the warm instance's lifetime.
export default handle(createApp());
