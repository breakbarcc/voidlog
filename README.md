# voidlog — GW2 Log Analysis Platform

![Next.js](https://img.shields.io/github/package-json/dependency-version/breakbarcc/voidlog/next?filename=apps%2Fweb%2Fpackage.json&label=Next.js&logo=next.js&logoColor=white&color=black)
![React](https://img.shields.io/github/package-json/dependency-version/breakbarcc/voidlog/react?filename=apps%2Fweb%2Fpackage.json&label=React&logo=react&logoColor=white&color=149eca)
![TypeScript](https://img.shields.io/github/package-json/dependency-version/breakbarcc/voidlog/dev/typescript?filename=package.json&label=TypeScript&logo=typescript&logoColor=white&color=3178c6)
![Prisma](https://img.shields.io/github/package-json/dependency-version/breakbarcc/voidlog/@prisma/client?filename=packages%2Fdb%2Fpackage.json&label=Prisma&logo=prisma&logoColor=white&color=2d3748)
![BullMQ](https://img.shields.io/github/package-json/dependency-version/breakbarcc/voidlog/bullmq?filename=packages%2Fshared%2Fpackage.json&label=BullMQ&logo=redis&logoColor=white&color=c53030)
![pnpm](https://img.shields.io/badge/pnpm-12.4-f69220?logo=pnpm&logoColor=white)
![Node](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fbreakbarcc%2Fvoidlog%2Fmain%2Fpackage.json&query=%24.engines.node&label=node&logo=node.js&logoColor=white&color=339933)
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
            EncounterResult/PhaseResult/MechanicEvent/PlayerResult/PlayerPhaseDamage,
            ProjectInvite/ProjectPlayerRole/BatchPlayerRole,
            Auth.js adapter tables)
  shared/   Shared TS types, S3 storage client (ADR-003),
            BullMQ queue configuration (ADR-004)
scripts/
  test-e2e.ts          End-to-end test of the data/job flow
  backfill-greens.ts, backfill-target-buff-stacks.ts
                       Backfill derived data for already-parsed logs
  seed-test-session.ts Dev login bypass without a real Discord app (see below)
```

## Prerequisites

- Node.js >= 22.13 (required by `pnpm@12.4.2`, see `packageManager` in `package.json`)
- [pnpm](https://pnpm.io/) (enable via `corepack enable`)
- Docker + Docker Compose (for Postgres, Redis, MinIO)

## Setup

```bash
pnpm install
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
dependency). Web and worker must be running, the worker with
`LOG_PARSER=mock`; the script logs in with a short-lived session of its
own test user. For a real dps.report test run: set `LOG_PARSER=dps-report`
and `TEST_EVTC_PATH=/path/to/file.evtc`, restart the worker, then rerun —
without `TEST_EVTC_PATH` the script refuses to send its dummy file to
dps.report.

There is no unit test suite yet — `test-e2e.ts` is the only automated
check.

## Other scripts

```bash
pnpm build          # builds all apps
pnpm lint            # ESLint across all packages
pnpm format          # Prettier across the whole repo
pnpm format:check     # Prettier check without writing
pnpm typecheck        # tsc --noEmit across all packages
pnpm backfill:greens  # backfill greens data for already-parsed logs
pnpm backfill:target-buff-stacks  # backfill target buff stacks for already-parsed logs
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
- [x] Reveal mechanic analysis
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
