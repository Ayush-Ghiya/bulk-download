// Re-export Hono's Vercel adapter from inside the server workspace, where
// the `hono` package resolves (it is a server dependency, not hoisted to the
// repo root). The Vercel function imports `handle` from here so its module
// graph resolves `hono/vercel` correctly when bundled.
export { handle } from "hono/vercel";
