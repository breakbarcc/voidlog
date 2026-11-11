# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

voidlog is a web app for uploading, parsing, and comparing Guild Wars 2 EVTC combat logs, organized into projects ("training groups") tracked over weeks/months. Architecture rationale for every major decision lives in [`docs/ADR-GW2-Log-Analyse-Plattform.md`](docs/ADR-GW2-Log-Analyse-Plattform.md) (German) — consult it (ADR-001 through ADR-009) before making structural changes; it explains *why*, not just *what*.

Currently only one boss encounter is curated end-to-end: Harvest Temple CM / "Die Drachenleere" (bossId `43488`, Dragon's End). Phase names, mechanic translations, and cast markers are all hand-curated per boss — see "Boss-specific curation" below.

## Commands

```bash
pnpm install
docker compose up -d        # Postgres :5433, Redis :6380, MinIO :9000 (console :9001, login voidlog/voidlog123)
cp .env.example .env
pnpm dev                     # runs apps/web (:4000) + apps/worker in parallel
```

```bash
pnpm build                   # builds apps/web and apps/worker
pnpm lint                    # eslint on scripts/, then in every package (pnpm --recursive run lint)
pnpm format                  # prettier --write . (rewrites line endings repo-wide — prefer formatting single files)
pnpm typecheck                # root tsc --noEmit (scripts/), then the typecheck script of every package incl. apps/web
```

Per-package typecheck:

```bash
pnpm --filter @voidlog/web run typecheck
pnpm --filter @voidlog/worker run typecheck
```

The shared `eslint.config.mjs` at the root (used by apps/worker, packages/db, packages/shared and scripts/) needs the root devDependencies `eslint`, `@eslint/js` and `typescript-eslint`; apps/web has its own config on top of `eslint-config-next`.

No unit test framework is set up. The only test is an end-to-end data/job-flow proof script:

```bash
pnpm test:e2e                # storage upload -> queue -> worker -> Postgres, against MockParser by default
```

It needs apps/web and apps/worker running. The enqueue route requires a logged-in project member, so the script creates a short-lived DB session for its own E2E user, sends it as the `authjs.session-token` cookie and deletes it afterwards. The worker must run with `LOG_PARSER=mock` (dotenv-cli doesn't override variables already set, so e.g. `$env:LOG_PARSER='mock'; pnpm dev` and the same for `pnpm test:e2e`) — with `LOG_PARSER=dps-report` and no `TEST_EVTC_PATH` the script refuses to run, so it never uploads its dummy file to dps.report.

For a real dps.report run instead of the mock: set `LOG_PARSER=dps-report` and `TEST_EVTC_PATH=/path/to/file.evtc` in `.env`, restart the worker, then rerun.

```bash
pnpm seed:test-session        # creates a test user + valid DB session, prints an authjs.session-token
                               # cookie value to set manually — bypasses real Discord OAuth for local testing
```

Prisma (run from `packages/db`, or via `pnpm --filter @voidlog/db`):

```bash
pnpm --filter @voidlog/db run migrate:dev     # create + apply a migration locally
pnpm --filter @voidlog/db run migrate:deploy  # apply pending migrations (no new migration)
pnpm --filter @voidlog/db run studio          # Prisma Studio
pnpm --filter @voidlog/db run generate        # regenerate the Prisma client (needed after editing schema.prisma
                                               # if a dev server has the query engine DLL locked, stop it first)
```

## Monorepo structure

```
apps/
  web/      Next.js 16 (App Router, TypeScript, Tailwind v4, Radix Themes) — frontend + BFF, Auth.js/Discord
  worker/   Node/TS service — BullMQ queue consumer, LogParser, streaming extraction
packages/
  db/       Prisma schema + generated client (User/Project/ProjectMember/UploadBatch/LogFile/
            EncounterResult/PhaseResult/MechanicEvent/PlayerResult, plus Auth.js adapter tables)
  shared/   Cross-app TS types, S3-compatible storage client, BullMQ queue config/connection
scripts/
  test-e2e.ts           end-to-end data/job-flow proof (see above)
  seed-test-session.ts  dev login bypass (see above)
```

## Architecture

### Ingestion pipeline (upload → parsed data)

1. **Upload**: the web app hands out presigned S3 PUT URLs (ADR-003) — raw `.evtc`/`.zevtc` files go straight from the browser to object storage (MinIO locally, e.g. R2 in prod), never through the Next.js server. A `LogFile` row is created per file, `UploadBatch` groups files uploaded together.
2. **Enqueue**: the route handler enqueues one BullMQ job per `LogFile` on the `log-parsing` queue (`packages/shared/src/queue.ts`), then streams progress back to the browser over SSE.
3. **Parse**: `apps/worker` consumes the queue (`job-processor.ts`), running the raw file through a `LogParser` (ADR-002) — either `MockParser` or the real `DpsReportParser` (uploads to dps.report's API, polls until `jsonAvailable`, then streams back `/getJson`'s response). Selected via `LOG_PARSER` env var (`apps/worker/src/parsers/log-parser-factory.ts`). The worker centrally rate-limits to dps.report's global 25 uploads/60s (`apps/worker/src/index.ts`, BullMQ `limiter`).
4. **Extract**: `apps/worker/src/extraction/extract-encounter.ts` streams the EI JSON response through `stream-json` and picks out only a small, fixed set of fields (ADR-008) — the full response can be tens of MB, almost all of it per-player/per-target damage/buff breakdowns nobody reads. It keeps `phases`, `mechanics`, `skillMap`, and per-target `name`/`id`/`rotation` (boss cast log) whole, but never materializes `targets[]`'s much larger damage/buff/combat-replay fields. The exact field-picking logic (`ROOT_KEEP_WHOLE`, `PLAYER_KEEP_WHOLE`, `TARGET_KEEP_WHOLE`) is a hand-rolled streaming state machine — extend it carefully, it's easy to accidentally re-introduce full materialization.
5. **Persist**: `apps/worker/src/extraction/persist-encounter.ts` maps the extracted subset onto the Prisma schema (ADR-009) in one transaction: `EncounterResult` → `PhaseResult[]` → `PlayerResult[]` → `MechanicEvent[]`. Each mechanic event's `phaseResultId` is resolved by `resolvePhaseIndex`, which picks the *narrowest* phase containing the timestamp (not the first match — "Full Fight" spans the whole encounter and would otherwise swallow everything).
6. **Serve**: web app pages query Postgres directly via `@voidlog/db`'s Prisma client — the raw JSON itself is never stored, only the derived rows (so trend queries never re-parse).

### Boss-specific curation (hand-authored, not DB-editable — ADR-009)

Curation is deliberately code, not an editable admin table. The core pipeline (extraction, persistence, Prisma schema) is already boss-agnostic — verified by running an entirely different encounter (Cerus, Cosmic Observatory) through the unmodified worker pipeline and watching it persist cleanly with zero curation. What's boss-specific is purely presentation data, organized **one file per boss** rather than one file per concern, specifically so adding a boss never means editing the same giant flat map another boss's entries already live in (raw phase/mechanic names aren't guaranteed unique across encounters — e.g. Cerus has phases literally named "Phase 1"/"Split 1"):

- `apps/web/src/lib/bosses/types.ts` — the `BossCuration` shape every boss module implements: `isMainPhase`, `phaseColor`, `mechanicNames`, `noiseMechanicNames`, `visibleCastMarkers`.
- `apps/web/src/lib/bosses/harvest-temple.ts` — the only curated boss today (Harvest Temple CM, bossId `43488`): dragon phase names + colors, German mechanic-name translations (cross-checked against EI's own source where possible; unverified guesses marked "(vermutlich)"), noise-mechanic list, curated cast-marker names.
- `apps/web/src/lib/bosses/registry.ts` — `Record<bossId, BossCuration>`; add a boss by creating a sibling file and registering it here, nothing else in the directory changes.
- `apps/web/src/lib/main-phases.ts` / `mechanic-names.ts` / `mechanics.ts` / `apps/web/src/components/phase-badge.tsx` — thin, boss-agnostic public API functions (`isMainPhase(bossId, ...)`, `translateMechanicName(bossId, ...)`, `isNoiseMechanic(bossId, ...)`, `isVisibleCastMarker(bossId, ...)`, `phaseColor(bossId, ...)`) that look up the right `BossCuration` via the registry first. **Always pass the real `bossId`** — a boss without curation degrades gracefully (unfiltered phases, generic color cycle, fallback-humanized mechanic names) rather than throwing.
- `apps/worker/src/boss-configs/cast-markers.ts` — boss-ability *casts* synthesized as `MechanicEvent` rows from the target's own cast log (`targets[].rotation`), independent of whether a player got hit. `mechanics[]` in the EI JSON only records hits, so a cast every player dodged is otherwise invisible. Two layers: a short curated list shown as distinct UI timeline ticks, plus a generic bulk capture of every other rotation skill per target (stored for later analysis, not surfaced in the UI yet). **Targets are matched by `EiTarget.id`, never `name`** — target names are localized to the recording client's game-client language (confirmed: the same encounter's giants are named differently in German vs. English clients, but share one stable `id`).
- `apps/worker/src/boss-configs/registry.ts` — per-boss `BossConfig` lookup (raw EI mechanic name → category/display name); currently only a `test-boss` fixture is registered, so all real bosses fall back to category `boss_specific` for every mechanic. This is the mechanism ADR-009 describes for curating `MechanicEvent.category`/`.displayName`, mostly still unused.

`batch-attempts.tsx`'s per-attack timeline glyphs (bite/diamond/arrow/rings/waves icons) are still hardcoded to Harvest Temple's 5 curated cast markers, not yet boss-pluggable — a future boss gets curated colors/names/phases automatically via the registry, but its cast markers won't get bespoke icons without also touching that component.

### Auth & project scoping (ADR-007)

Auth.js with a Discord OAuth provider. Every project-scoped page/route must confirm membership before touching data — `apps/web/src/lib/session.ts` (`requireSession`) and `apps/web/src/lib/projects.ts` (`requireProjectMembership`/`requireProjectOwnership`) both wrap their DB lookup in React's `cache()`, so a layout and the page(s) it wraps share one query per request instead of duplicating it.

### Frontend

Next.js App Router with a `(app)` route group holding all authenticated pages under a shared sidebar layout; `app/login/` sits outside the group. Styling is Tailwind v4 + Radix Themes on a dark-only custom palette defined as CSS custom properties in `apps/web/src/app/globals.css` (no light mode). `apps/web/src/components/phase-badge.tsx` centralizes per-phase/per-dragon color assignment, reused across pages.

**`apps/web/AGENTS.md` is auto-regenerated by `next dev` on every run** (see `node_modules/next/dist/server/lib/generate-agent-files.js`) and warns that this project's Next.js version has training-data-breaking API/convention changes — consult `node_modules/next/dist/docs/` before writing Next.js-specific code rather than relying on prior knowledge of the framework.
