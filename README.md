# voidlog — GW2 Log Analysis Platform

![Next.js](https://img.shields.io/badge/Next.js-16.3-black?logo=next.js&logoColor=white)
![React](https://img.shields.io/badge/React-19.2-149eca?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178c6?logo=typescript&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-5.22-2d3748?logo=prisma&logoColor=white)
![BullMQ](https://img.shields.io/badge/BullMQ-5.28-c53030?logo=redis&logoColor=white)
![pnpm](https://img.shields.io/badge/pnpm-11.22-f69220?logo=pnpm&logoColor=white)
![Node](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-green.svg)

A web app for uploading, parsing, and comparing Guild Wars 2 EVTC combat
logs, organized into projects ("training groups") tracked across weeks or
months. See [`docs/ADR-GW2-Log-Analyse-Plattform.md`](docs/ADR-GW2-Log-Analyse-Plattform.md)
(German) for the architecture decisions behind the stack.

**Status:** core flow is complete and in real use — Discord login,
project-scoped batch uploads, background parsing via dps.report, and a
dark-themed dashboard covering project trends, per-batch stat cards, a
phase/mechanic timeline per attempt, single-log breakdowns, and roster
stats. Boss-specific curation (phase names, mechanic translations, cast
markers) currently covers one encounter: Harvest Temple CM / "Die
Drachenleere" (Dragon's End).

## Contents

- [Project layout](#project-layout)
- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Development](#development)
- [Testing](#testing)
- [Other scripts](#other-scripts)
- [Status & roadmap](#status--roadmap)
- [License](#license)

## Project layout

```
apps/
  web/      Next.js (App Router, TypeScript, Tailwind) — frontend + BFF,
            Auth.js with Discord provider (ADR-007)
  worker/   Node/TS service — queue consumer, LogParser, extraction
            (ADR-002/004/008/009)
packages/
  db/       Prisma schema (User/Project/ProjectMember/UploadBatch/LogFile/
            EncounterResult/PhaseResult/MechanicEvent/PlayerResult,
            Auth.js adapter tables)
  shared/   Shared TS types, S3 storage client (ADR-003),
            BullMQ queue configuration (ADR-004)
scripts/
  test-e2e.ts          End-to-end test of the data/job flow (step 2)
  seed-test-session.ts Dev login bypass without a real Discord app (see below)
```

## Prerequisites

- Node.js >= 22.13 (required by `pnpm@11.22.0`, see `packageManager` in `package.json`)
- [pnpm](https://pnpm.io/) (enable via `corepack enable`)
- Docker + Docker Compose (for Postgres, Redis, MinIO)

## Setup

```bash
pnpm install
pnpm approve-builds   # allow native/build scripts (Prisma client generation etc.)
docker compose up -d
cp .env.example .env
```

### Register a Discord application (for real login)

1. Create a new application in the [Discord Developer Portal](https://discord.com/developers/applications).
2. Under "OAuth2", add a redirect URI:
   `http://localhost:4000/api/auth/callback/discord`.
3. Enter `AUTH_DISCORD_ID` (client ID) and `AUTH_DISCORD_SECRET` (client secret)
   in `.env`.

### Testing without your own Discord application

```bash
pnpm seed:test-session
```

Creates a test user and a valid DB session, and prints the cookie value
(`authjs.session-token`) that you can set in the browser (DevTools →
Application → Cookies) for `127.0.0.1:4000`, to view protected pages
without a real OAuth flow.

## Development

```bash
pnpm dev
```

Runs `apps/web` (http://127.0.0.1:4000) and `apps/worker` in parallel.

Local infrastructure (Postgres on `:5433`, Redis on `:6380`, MinIO S3 API
on `:9000` / console on `:9001`, login `voidlog` / `voidlog123`) runs via
`docker compose up -d` and stops with:

```bash
docker compose down
```

## Testing

```bash
pnpm test:e2e
```

Proves the complete data/job flow (storage upload → queue → worker →
Postgres) without a UI, against `MockParser` by default (no external
dependency). For a real dps.report test run: set `LOG_PARSER=dps-report`
and `TEST_EVTC_PATH=/path/to/file.evtc`, restart the worker, then rerun.

There is no unit test suite yet — `test-e2e.ts` is the only automated
check.

## Other scripts

```bash
pnpm build          # builds all apps
pnpm lint            # ESLint across all packages
pnpm format          # Prettier across the whole repo
pnpm typecheck        # tsc --noEmit across all packages
```

## Status & roadmap

- [x] Monorepo scaffold, runnable, no business logic.
- [x] Full data model + migration, storage client, queue wiring, real
  `DpsReportParser`, SSE progress — proven via test script/curl, no UI.
- [x] Auth.js with Discord provider (ADR-007), protected routes, all
  seven core pages (login, dashboard, project detail, batch upload,
  batch detail, log analysis, roster) wired to real data.
- [x] Dark-themed UI on Radix Themes + Tailwind, applied across all pages.
- [x] Per-batch phase/mechanic timeline with boss-specific cast markers,
  curated mechanic translations, and chronological sorting by in-game
  recording time rather than upload order.
- [x] Per-mechanic filter to show/hide individual mechanics
- [x] add HTCm greens mechanic in boss attack row
- [ ] Reveal mechanic analysis
- [ ] Improve mechanic aggregation across a log batch
- [ ] Track player revives (who revived whom, and when) — `MechanicEvent`
  currently stores one `actor` per "Res"/"Resp"/"Got up" event (real EI
  mechanics, already extracted but filtered as noise), which isn't enough
  to attribute a revive to both the reviver and the revived player. Needs
  investigating EI's per-player `support`/`deathRecap` stats or the
  (currently discarded) player skill-cast `rotation` log against a real
  dps.report response before extraction/schema changes are decided.
- [ ] Charts for the batch overview page
  - [x] add runs which failed by greens as diagram
- [ ] Curate additional boss encounters beyond Harvest Temple CM

## License

MIT — see [LICENSE](LICENSE).
