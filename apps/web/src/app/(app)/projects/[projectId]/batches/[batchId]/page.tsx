import { LogFileStatus, MechanicCategory, prisma } from "@voidlog/db";
import { Card } from "@radix-ui/themes";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/locale";
import { BatchSwitcher } from "@/components/batch-switcher";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { PhaseBadge } from "@/components/phase-badge";
import { isMainPhase } from "@/lib/main-phases";
import { translateMechanicName } from "@/lib/mechanic-names";
import { isContextualNoiseMechanic, isNoiseMechanic, isVisibleCastMarker } from "@/lib/mechanics";
import { requireProjectMembership } from "@/lib/projects";
import { requireSession } from "@/lib/session";
import {
  BatchAttempts,
  type AttemptRow,
  type BatchPhaseStat,
  type BatchRosterRow,
} from "./batch-attempts";
import { BatchLabelEditor } from "./batch-label-editor";
import { DeleteBatchButton } from "./delete-batch-button";
import { RemoveLogButton } from "./remove-log-button";
import { RetryLogButton } from "./retry-log-button";

// Reads MechanicEvent.context.phaseEnd.msSincePhaseEnd (see stealth-phases.ts
// on the worker) without assuming the JSON shape — context is untyped Json?
// in the schema, and only the stealth-phase events (currently just
// "Invis.Cast") populate this key at all.
function readMsSincePhaseEnd(context: unknown): number | undefined {
  if (!context || typeof context !== "object") return undefined;
  const phaseEnd = (context as Record<string, unknown>).phaseEnd;
  if (!phaseEnd || typeof phaseEnd !== "object") return undefined;
  const value = (phaseEnd as Record<string, unknown>).msSincePhaseEnd;
  return typeof value === "number" ? value : undefined;
}

// Reads MechanicEvent.context.msSinceInvisCast (see persist-encounter.ts on
// the worker) — only populated on "Revealed" events, measuring from the
// causing Mass-Invisibility cast's channel *end* (not its start, and not the
// dragon phase's end like `msSincePhaseEnd`).
function readMsSinceInvisCast(context: unknown): number | undefined {
  if (!context || typeof context !== "object") return undefined;
  const value = (context as Record<string, unknown>).msSinceInvisCast;
  return typeof value === "number" ? value : undefined;
}

// storageKeyRaw looks like "raw/<batchId>/<uuid>-<sanitized filename>" — strip
// the batch/uuid prefix so failed uploads show the original filename.
function displayFileName(storageKeyRaw: string): string {
  const last = storageKeyRaw.split("/").pop() ?? storageKeyRaw;
  return last.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/, "");
}

// Minimal structural shapes for what the functions below actually read —
// deliberately not the full Prisma payload type (which would have to be
// threaded through as a generic from the query in the page component below).
// The real query result has more fields than this; TS structural typing
// accepts that without complaint.
interface MechanicEventLike {
  mechanicName: string;
  displayName: string;
  category: MechanicCategory;
  timeMs: number;
  context: unknown;
  playerResult: { characterName: string; account: string } | null;
}

interface PhaseResultLike {
  name: string;
  order: number;
  reached: boolean;
  success: boolean;
  startMs: number;
  endMs: number;
  mechanicEvents: MechanicEventLike[];
}

interface EncounterLike {
  bossId: string;
  success: boolean;
  isCM: boolean;
  durationMs: number;
  /** When the fight actually happened in-game (EI's timeStartStd) — null for encounters parsed before this field existed, see `createdAt` fallback below. */
  recordedAt: Date | null;
  /** Fallback for `recordedAt` — when this row was persisted, not when the fight happened. */
  createdAt: Date;
  playerResults: {
    account: string;
    characterName: string;
    dps: number;
    downs: number;
    role: string | null;
  }[];
  phaseResults: PhaseResultLike[];
}

interface LogFileLike {
  id: string;
  storageKeyRaw: string;
  encounterResult: EncounterLike | null;
}

type Encounters = { logFile: LogFileLike; encounter: EncounterLike }[];

/** Every LogFile that actually parsed into an EncounterResult, paired up for convenience. */
function collectEncounters(logFiles: readonly LogFileLike[]): Encounters {
  return logFiles.flatMap((logFile) =>
    logFile.encounterResult ? [{ logFile, encounter: logFile.encounterResult }] : [],
  );
}

/** Narrowest-reached main phase across every attempt in the batch — used for the "furthest phase" stat card. */
function computeFurthestPhase(
  encounters: Encounters,
): { name: string; order: number; bossId: string } | null {
  let furthestPhase: { name: string; order: number; bossId: string } | null = null;
  for (const { encounter } of encounters) {
    for (const phase of encounter.phaseResults) {
      if (
        phase.reached &&
        isMainPhase(encounter.bossId, phase.name) &&
        (!furthestPhase || phase.order > furthestPhase.order)
      ) {
        furthestPhase = { ...phase, bossId: encounter.bossId };
      }
    }
  }
  return furthestPhase;
}

// Keyed by phase *name*, not order: EI assigns `order` per attempt based on
// how many breakbar/CM sub-phases fired before it, so the same named phase
// (e.g. "Purification 2") can land at different order values across
// attempts. Grouping by order would then split it into duplicate cards.
// "S.Green"/"F.Green" are HTCM's raw success/fail codes for a Greens wave,
// "Green.Spawn" the synthetic per-wave marker clustered from them (see
// harvest-temple.ts) — any of the three means Greens happened in that phase
// for at least one attempt, even if every attempt in this particular batch
// resolved them successfully (0 fails). Tracked separately from `mechanics`
// below since Green.Spawn is a visible cast marker and S.Green is noise, so
// neither would otherwise leave a trace in the fail-count map.
const GREEN_MECHANIC_NAMES = new Set(["S.Green", "F.Green", "Green.Spawn"]);

interface PhaseAggregate {
  name: string;
  order: number;
  reachedCount: number;
  hasGreenMechanic: boolean;
  mechanics: Map<string, { mechanicName: string; displayName: string; count: number }>;
}

function buildPhaseAggregates(encounters: Encounters, locale: Locale): Map<string, PhaseAggregate> {
  const phaseAgg = new Map<string, PhaseAggregate>();
  for (const { encounter } of encounters) {
    for (const phase of encounter.phaseResults) {
      if (!isMainPhase(encounter.bossId, phase.name)) continue;
      const agg = phaseAgg.get(phase.name) ?? {
        name: phase.name,
        order: phase.order,
        reachedCount: 0,
        hasGreenMechanic: false,
        mechanics: new Map<string, { mechanicName: string; displayName: string; count: number }>(),
      };
      agg.order = Math.min(agg.order, phase.order);
      if (phase.reached) agg.reachedCount += 1;
      accumulatePhaseMechanics(agg, phase.mechanicEvents, encounter.bossId, locale);
      phaseAgg.set(phase.name, agg);
    }
  }
  return phaseAgg;
}

// Split out of buildPhaseAggregates purely to keep nesting (and therefore
// cognitive complexity) low in any single function — a triple-nested loop
// with branches inside all counts against the same function otherwise.
function accumulatePhaseMechanics(
  agg: PhaseAggregate,
  mechanicEvents: MechanicEventLike[],
  bossId: string,
  locale: Locale,
) {
  for (const event of mechanicEvents) {
    if (GREEN_MECHANIC_NAMES.has(event.mechanicName)) agg.hasGreenMechanic = true;
    // Visible cast markers (Jaws/Slam/Beam/ShckWv/Scream — see
    // cast-markers.ts on the worker) are synthetic orientation markers
    // (every cast), not a fail, so they're excluded from fail-count
    // aggregation here even though they're still included in the raw
    // `mechanics` array below (that feeds the timeline tick).
    if (
      event.mechanicName === "Dead" ||
      isVisibleCastMarker(bossId, event.mechanicName) ||
      isNoiseMechanic(bossId, event.mechanicName) ||
      isContextualNoiseMechanic(bossId, event, mechanicEvents)
    )
      continue;
    const entry = agg.mechanics.get(event.mechanicName) ?? {
      mechanicName: event.mechanicName,
      displayName: translateMechanicName(bossId, locale, event.mechanicName, event.displayName),
      count: 0,
    };
    entry.count += 1;
    agg.mechanics.set(event.mechanicName, entry);
  }
}

function computeBatchPhaseStats(
  encounters: Encounters,
  batchBossId: string,
  attempts: number,
  locale: Locale,
): BatchPhaseStat[] {
  const phaseAgg = buildPhaseAggregates(encounters, locale);
  return [...phaseAgg.values()]
    .sort((a, b) => a.order - b.order)
    .map((agg) => {
      // "F.Green" (see the Green-fail stat card above) is pinned first
      // whenever a phase has it, even if other fails outrank it by count —
      // Greens are always worth surfacing here, not just whichever mechanic
      // happened to fail the most. If Greens occurred in this phase but
      // every attempt in this batch resolved them successfully, still show
      // a 0-count chip rather than silently omitting Greens.
      const sorted = [...agg.mechanics.values()].sort((a, b) => b.count - a.count);
      const green = sorted.find((m) => m.mechanicName === "F.Green") ??
        (agg.hasGreenMechanic
          ? {
              mechanicName: "F.Green",
              displayName: translateMechanicName(batchBossId, locale, "F.Green", "F.Green"),
              count: 0,
            }
          : undefined);
      const others = sorted.filter((m) => m.mechanicName !== "F.Green");
      const mechanics = green ? [green, ...others.slice(0, 2)] : others.slice(0, 3);
      return {
        name: agg.name,
        order: agg.order,
        reached: agg.reachedCount,
        total: attempts,
        mechanics,
      };
    });
}

interface RosterAccumulator {
  characterNames: Set<string>;
  encounters: number;
  totalDps: number;
  kills: number;
  totalDowns: number;
  roleCounts: Map<string, number>;
  failedMechanics: number;
  shockwaveHits: number;
  debilitatedHits: number;
  revealCount: number;
}

// Same fail definition as the phase-aggregation stats above: everything
// except deaths, curated cast markers, and noise mechanics.
function accumulateRosterFails(rosterByAccount: Map<string, RosterAccumulator>, encounter: Encounters[number]["encounter"]) {
  for (const phase of encounter.phaseResults) {
    for (const event of phase.mechanicEvents) {
      if (!event.playerResult) continue;
      if (
        event.mechanicName === "Dead" ||
        isVisibleCastMarker(encounter.bossId, event.mechanicName) ||
        isNoiseMechanic(encounter.bossId, event.mechanicName) ||
        isContextualNoiseMechanic(encounter.bossId, event, phase.mechanicEvents)
      )
        continue;
      const entry = rosterByAccount.get(event.playerResult.account);
      if (!entry) continue;
      entry.failedMechanics += 1;
      // "ShckWv.H" is Mordremoth's raw EI code for a Schockwelle hit — same
      // hardcoded-stat treatment as the batch-wide stat card above.
      if (event.mechanicName === "ShckWv.H") entry.shockwaveHits += 1;
      // "Debilitated" is HTCM's raw EI debuff name for the Geschwächt stack
      // (see harvest-temple.ts) — same hardcoded-stat treatment.
      if (event.mechanicName === "Debilitated") entry.debilitatedHits += 1;
      // "Revealed" is only persisted for isolated early reveals during the
      // Mass-Invisibility stealth window (group "attack now" calls are
      // filtered out entirely — see stealth-phases.ts on the worker), so
      // every occurrence here is already a genuine early-reveal mistake.
      if (event.mechanicName === "Revealed") entry.revealCount += 1;
    }
  }
}

// Grouped by account, not character name — character names change, the
// account handle doesn't (ADR-009), same convention as the project roster.
// Reuses the already-fetched encounters/phaseResults/mechanicEvents instead
// of a separate query.
function computeBatchRoster(encounters: Encounters): BatchRosterRow[] {
  const rosterByAccount = new Map<string, RosterAccumulator>();
  for (const { encounter } of encounters) {
    for (const p of encounter.playerResults) {
      const entry = rosterByAccount.get(p.account) ?? {
        characterNames: new Set<string>(),
        encounters: 0,
        totalDps: 0,
        kills: 0,
        totalDowns: 0,
        roleCounts: new Map<string, number>(),
        failedMechanics: 0,
        shockwaveHits: 0,
        debilitatedHits: 0,
        revealCount: 0,
      };
      entry.characterNames.add(p.characterName);
      entry.encounters += 1;
      entry.totalDps += p.dps;
      entry.totalDowns += p.downs;
      if (encounter.success) entry.kills += 1;
      if (p.role) entry.roleCounts.set(p.role, (entry.roleCounts.get(p.role) ?? 0) + 1);
      rosterByAccount.set(p.account, entry);
    }
    accumulateRosterFails(rosterByAccount, encounter);
  }
  return [...rosterByAccount.entries()]
    .map(([account, entry]) => ({
      account,
      characterNames: [...entry.characterNames].join(", "),
      role: [...entry.roleCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—",
      encounters: entry.encounters,
      kills: entry.kills,
      avgDps: Math.round(entry.totalDps / entry.encounters),
      avgDowns: (entry.totalDowns / entry.encounters).toFixed(1),
      failedMechanics: entry.failedMechanics,
      shockwaveHits: entry.shockwaveHits,
      debilitatedHits: entry.debilitatedHits,
      revealCount: entry.revealCount,
    }))
    .sort((a, b) => b.failedMechanics - a.failedMechanics);
}

function buildAttemptRow(
  { logFile, encounter }: Encounters[number],
  index: number,
  locale: Locale,
): AttemptRow {
  const mainPhases = encounter.phaseResults.filter((p) => isMainPhase(encounter.bossId, p.name));
  // EI doesn't always cover every second of the fight with a named main
  // phase — e.g. a dragon's own phase can end several seconds before the
  // next main phase's `startMs` (that gap is exactly where the
  // Mass-Invisibility stealth window lives, see stealth-phases.ts on the
  // worker). Used below so `eventsInRange` attributes a gap-dwelling event
  // to the phase it causally followed instead of silently dropping it.
  const mainPhasesByStart = [...mainPhases].sort((a, b) => a.startMs - b.startMs);
  const reachedMainPhases = mainPhases.filter((p) => p.reached);
  const furthest = reachedMainPhases.at(-1) ?? null;
  return {
    logFileId: logFile.id,
    fileName: displayFileName(logFile.storageKeyRaw),
    bossId: encounter.bossId,
    isCM: encounter.isCM,
    n: index + 1,
    success: encounter.success,
    furthestPhase: furthest ? { name: furthest.name, order: furthest.order } : null,
    durationMs: encounter.durationMs,
    recordedAt: encounter.recordedAt ?? encounter.createdAt,
    segments: reachedMainPhases.map((p) => ({
      name: p.name,
      order: p.order,
      leftPct: (p.startMs / encounter.durationMs) * 100,
      widthPct: ((p.endMs - p.startMs) / encounter.durationMs) * 100,
    })),
    // Deaths/mechanic fails are time markers, not phase-progression UI — keep
    // them from every phase result (including EI's auto-generated breakbar
    // sub-phases, where most mechanic-fail events actually get recorded),
    // unlike segments/phases below which are curated to main boss phases.
    deaths: encounter.phaseResults.flatMap((p) =>
      p.mechanicEvents
        .filter((m) => m.mechanicName === "Dead")
        .map((m) => ({ timeMs: m.timeMs, player: m.playerResult?.characterName ?? null })),
    ),
    mechanics: encounter.phaseResults.flatMap((p) =>
      p.mechanicEvents
        .filter(
          (m) =>
            m.mechanicName !== "Dead" &&
            !isNoiseMechanic(encounter.bossId, m.mechanicName) &&
            !isContextualNoiseMechanic(encounter.bossId, m, p.mechanicEvents),
        )
        .map((m) => ({
          timeMs: m.timeMs,
          name: translateMechanicName(encounter.bossId, locale, m.mechanicName, m.displayName),
          mechanicName: m.mechanicName,
          player: m.playerResult?.characterName ?? null,
          msSincePhaseEnd: readMsSincePhaseEnd(m.context),
          msSinceInvisCast: readMsSinceInvisCast(m.context),
        })),
    ),
    phases: mainPhases.map((p) =>
      buildAttemptPhase(p, mainPhasesByStart, encounter, locale),
    ),
  };
}

function buildAttemptPhase(
  p: Encounters[number]["encounter"]["phaseResults"][number],
  mainPhasesByStart: Encounters[number]["encounter"]["phaseResults"],
  encounter: Encounters[number]["encounter"],
  locale: Locale,
): AttemptRow["phases"][number] {
  // Don't rely on p.mechanicEvents here: persistence assigns each event to
  // the *narrowest* containing PhaseResult (resolvePhaseIndex in
  // persist-encounter.ts), which is often an auto-generated breakbar/
  // intermission sub-phase nested inside this main phase (e.g. "Grav.Cru.H"
  // events land under "Void Time Caster", not "Purification 2") — those
  // would silently vanish from the filter groups below even though they
  // still show up in the `mechanics` field above (built from *all*
  // phaseResults). Re-bucket by time range instead, so every event that
  // happened during this phase's window is included regardless of which
  // sub-phase record it's attached to. The upper bound is the *next* main
  // phase's start, not this phase's own `endMs` — extends coverage through
  // any gap where EI doesn't have a named phase running (see
  // mainPhasesByStart above) so an event landing there attributes to the
  // phase it followed instead of vanishing from every phase's bucket.
  const nextPhaseStart = mainPhasesByStart[mainPhasesByStart.indexOf(p) + 1]?.startMs ?? Infinity;
  const eventsInRange = encounter.phaseResults
    .flatMap((pr) => pr.mechanicEvents)
    .filter((m) => m.timeMs >= p.startMs && m.timeMs < nextPhaseStart);
  return {
    name: p.name,
    order: p.order,
    reached: p.reached,
    success: p.success,
    durationMs: p.endMs - p.startMs,
    // Keeps cast markers (boss attacks) in here too, unlike the death/
    // fail-only `mechanics` field above — the client needs them to build the
    // per-phase attack filter groups. isVisibleCastMarker is applied
    // client-side only when rendering the plain-text mechanic list.
    mechanics: eventsInRange
      .filter(
        (m) =>
          m.mechanicName !== "Dead" &&
          !isNoiseMechanic(encounter.bossId, m.mechanicName) &&
          !isContextualNoiseMechanic(encounter.bossId, m, eventsInRange),
      )
      .map((m) => ({
        mechanicName: m.mechanicName,
        name: translateMechanicName(encounter.bossId, locale, m.mechanicName, m.displayName),
        player: m.playerResult?.characterName ?? null,
      })),
  };
}

export default async function BatchDetailPage(
  props: Readonly<PageProps<"/projects/[projectId]/batches/[batchId]">>,
) {
  const { projectId, batchId } = await props.params;
  const session = await requireSession();
  const membership = await requireProjectMembership(projectId, session.user.id);
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("batchDetail");
  const tCommon = await getTranslations("common");
  const tSidebar = await getTranslations("sidebar");

  const allBatches = await prisma.uploadBatch.findMany({
    where: { projectId },
    select: { id: true, label: true },
    orderBy: { createdAt: "desc" },
  });

  const batch = await prisma.uploadBatch.findUnique({
    where: { id: batchId },
    include: {
      logFiles: {
        orderBy: { createdAt: "asc" },
        include: {
          encounterResult: {
            include: {
              playerResults: true,
              phaseResults: {
                orderBy: { order: "asc" },
                include: {
                  mechanicEvents: { include: { playerResult: true }, orderBy: { timeMs: "asc" } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!batch || batch.projectId !== projectId) {
    notFound();
  }

  const encounters = collectEncounters(batch.logFiles);
  const failedLogFiles = batch.logFiles.filter((f) => f.status === LogFileStatus.FAILED);

  const attempts = encounters.length;
  const revealReached = encounters.filter((e) =>
    e.encounter.phaseResults.some((p) =>
      p.mechanicEvents.some((m) => m.category === MechanicCategory.REVEAL),
    ),
  ).length;
  // "F.Green" is HTCM's raw EI mechanic code for a failed Green stack (see
  // harvest-temple.ts) — hardcoded like the timeline's attack glyphs
  // elsewhere in this batch view, pending a boss-pluggable stat-card system.
  const greenFailedCount = encounters.filter((e) =>
    e.encounter.phaseResults.some((p) =>
      p.mechanicEvents.some((m) => m.mechanicName === "F.Green"),
    ),
  ).length;
  // "ShckWv.H" is Mordremoth's raw EI code for a Schockwelle hit — same
  // hardcoded-stat-card treatment as the Green-fail count above.
  const shockwaveHitCount = encounters.filter((e) =>
    e.encounter.phaseResults.some((p) =>
      p.mechanicEvents.some((m) => m.mechanicName === "ShckWv.H"),
    ),
  ).length;

  // Assumes one boss per batch (true for every real batch so far) — used
  // for the aggregate phase cards and the client-side timeline component,
  // which both need a single bossId to resolve curated colors/mechanics.
  const batchBossId = encounters[0]?.encounter.bossId ?? "";

  const furthestPhase = computeFurthestPhase(encounters);
  const batchPhaseStats = computeBatchPhaseStats(encounters, batchBossId, attempts, locale);
  const batchRoster = computeBatchRoster(encounters);
  const attemptRows: AttemptRow[] = encounters.map((entry, i) =>
    buildAttemptRow(entry, i, locale),
  );

  return (
    <div className="px-10 py-8">
      <Breadcrumbs
        items={[
          { label: tSidebar("projects"), href: "/" },
          { label: membership.project.name, href: `/projects/${projectId}` },
          { label: batch.label },
        ]}
      />
      <div className="mb-6 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <BatchLabelEditor batchId={batchId} label={batch.label} />
          {allBatches.length > 1 ? (
            <BatchSwitcher projectId={projectId} batches={allBatches} currentBatchId={batchId} />
          ) : null}
        </div>
        <DeleteBatchButton projectId={projectId} batchId={batchId} batchLabel={batch.label} />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3.5 lg:grid-cols-5">
        <Card size="2" className="border-line bg-surface border">
          <div className="text-muted mb-1.5 text-[11px] font-medium uppercase tracking-wide">
            {t("totalAttempts")}
          </div>
          <div className="font-heading text-foreground text-xl font-bold">{attempts}</div>
        </Card>
        <Card size="2" className="border-line bg-surface border">
          <div className="text-muted mb-1.5 text-[11px] font-medium uppercase tracking-wide">
            {t("reveals")}
          </div>
          <div className="font-heading text-foreground text-xl font-bold">
            {revealReached}{" "}
            <span className="text-muted text-sm font-medium">
              ({attempts > 0 ? Math.round((revealReached / attempts) * 100) : 0}%)
            </span>
          </div>
        </Card>
        <Card size="2" className="border-line bg-surface border">
          <div className="text-muted mb-1.5 text-[11px] font-medium uppercase tracking-wide">
            {t("greenMissed")}
          </div>
          <div className="font-heading text-danger text-xl font-bold">
            {greenFailedCount}{" "}
            <span className="text-muted text-sm font-medium">
              ({attempts > 0 ? Math.round((greenFailedCount / attempts) * 100) : 0}%)
            </span>
          </div>
        </Card>
        <Card size="2" className="border-line bg-surface border">
          <div className="text-muted mb-1.5 text-[11px] font-medium uppercase tracking-wide">
            {t("shockwavesHit")}
          </div>
          <div className="font-heading text-danger text-xl font-bold">
            {shockwaveHitCount}{" "}
            <span className="text-muted text-sm font-medium">
              ({attempts > 0 ? Math.round((shockwaveHitCount / attempts) * 100) : 0}%)
            </span>
          </div>
        </Card>
        <Card size="2" className="border-line bg-surface border">
          <div className="text-muted mb-1.5 text-[11px] font-medium uppercase tracking-wide">
            {t("furthestPhase")}
          </div>
          {furthestPhase ? (
            <PhaseBadge
              bossId={furthestPhase.bossId}
              name={furthestPhase.name}
              order={furthestPhase.order}
            />
          ) : (
            <span className="text-muted text-sm">{tCommon("dash")}</span>
          )}
        </Card>
      </div>

      {failedLogFiles.length > 0 ? (
        <div className="mb-6">
          <div className="text-muted-strong mb-2.5 text-sm font-semibold">
            {t("failedUploads")}
          </div>
          <div className="border-line bg-surface divide-line-soft flex flex-col divide-y rounded-sm border">
            {failedLogFiles.map((logFile) => (
              <div key={logFile.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <div className="text-foreground truncate font-mono text-xs">
                    {displayFileName(logFile.storageKeyRaw)}
                  </div>
                  {logFile.errorMessage ? (
                    <div className="text-danger mt-1 truncate text-xs">{logFile.errorMessage}</div>
                  ) : null}
                </div>
                <div className="flex items-start gap-2">
                  <RetryLogButton logFileId={logFile.id} />
                  <RemoveLogButton logFileId={logFile.id} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <BatchAttempts
        projectId={projectId}
        batchId={batchId}
        bossId={batchBossId}
        attempts={attemptRows}
        batchPhaseStats={batchPhaseStats}
        roster={batchRoster}
      />
    </div>
  );
}
