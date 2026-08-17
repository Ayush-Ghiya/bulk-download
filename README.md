# Bulk Download Demo

A standalone extract of Asset Hub's "Download All" feature: an idempotent,
content-addressed ZIP cache and a tee-streaming archive builder, wrapped in a
live SSE-driven flow visualization.

Status: under construction. See [`docs/`](docs/) for the architecture writeup.

## Run

```bash
# server
cd server && bun install && bun run dev
# web (second terminal)
cd web && bun install && bun run dev
```
