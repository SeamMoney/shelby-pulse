# Repository Guidelines

## Project Structure & Module Organization
Active development lives in a small Turborepo: `apps/candlestick-game` (React/Vite frontend), `services/producer` (Node stream + Shelby writer), and `packages/candle-primitives` (shared codecs + manifests). Use `scripts/data` for one-off generation/bench tooling and `scripts/shelby` for verification jobs. The `examples/` and `q5.js/` directories stay read-only as upstream references—do not edit them. Shared configs (`package.json`, `turbo.json`, `pnpm-workspace.yaml`, `biome.json`, `tsconfig.base.json`) sit at repo root; extend them instead of redefining per-project rules.

## Build, Test, and Development Commands
Bootstrap with `pnpm install` (Node ≥ 22.15). Launch the full stack via `pnpm dev:stack`, which runs the producer service and frontend in parallel. Develop the producer alone with `pnpm --filter @shelby-cash/producer dev` and the client with `pnpm --filter @shelby-cash/candlestick-game dev`. Create builds through `pnpm build`, streamlining artifacts into `dist/`. Enforce formatting with `pnpm fmt` and lint using `pnpm lint`; both rely on Biome across packages. Run unit tests with `pnpm test:once`, end-to-end checks with `pnpm test:e2e`, and regenerate fixture data using `pnpm exec tsx scripts/data/generateRandom.ts`.

## Coding Style & Naming Conventions
Stick to strict TypeScript with ES modules and two-space indentation. React components use `PascalCase`, hooks `useCamelCase`, and supporting utilities `camelCase`. File and folder names stay `kebab-case`. Keep rendering logic side-effect free and colocate Vitest specs beside implementations (`*.test.ts`). Reserve comments for explaining non-obvious math (e.g., binary frame packing) and document config formats in `docs/` rather than inline blocks.

## Testing Guidelines
Unit tests run via Vitest in every package; add fixtures for candle serialization and order-matching behavior. Use Playwright under `apps/candlestick-game` for smoke tests that assert chart updates, WS resilience, and Shelby explorer links. All tests must run deterministically offline—mock Shelby API calls or gate them behind env toggles. Before opening a PR, run `pnpm lint`, `pnpm fmt`, `pnpm test:once`, and—when UI changes land—`pnpm test:e2e`.

## Commit & Pull Request Guidelines
Follow Conventional Commits (`feat(producer): batch shelby uploads`) so changelog tooling stays predictable. PRs should describe the functional change, reference associated Shelby docs or tickets, and paste the relevant command output (lint/test). Include screenshots or short clips when the frontend changes. If you touch binaries in `data/` or generated manifests, explain the inputs so reviewers can reproduce them locally. Keep explorer URLs in PR descriptions to prove end-to-end Shelby integration.
