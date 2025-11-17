# Build Log

## 2025-10-22
- Scaffolded Turborepo workspace with producer, frontend, and primitive packages.
- Implemented binary candle batch codec with metadata upgrades (`baseTimestampMs`, `sentAtMs`).
- Added random tick generator, WebSocket broadcaster, and local Shelby persistence stub.
- Introduced HTTP state endpoints for manifest/latest segment to bootstrap clients.
- Wired Vite React frontend to hydrate from persisted NDJSON before streaming over WS.
- Established pnpm lint/format/test workflows; all commands green.

TODO: swap local persistence for real Shelby uploads, add trade handling + explorer links, expand QA coverage.
