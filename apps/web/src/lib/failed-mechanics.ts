import { Prisma, prisma } from "@voidlog/db";
import type { Locale } from "@/i18n/locale";
import { translateMechanicName } from "./mechanic-names";
import {
  DOWNED_MECHANIC_NAME,
  GENERIC_CAST_MARKER_NAME_PART,
  isContextualNoiseMechanic,
  isNoiseMechanic,
  isVisibleCastMarker,
  unusedMechanicNames,
} from "./mechanics";
import { isMainPhase, progressPhases } from "./main-phases";
import { phaseColor } from "@/components/phase-badge";
import { loadProjectRoles } from "./player-roles";
import {
  TOP_FAILED_MECHANICS,
  TOP_FAILED_MECHANICS_PER_PHASE,
  type FailedMechanic,
  type FailedMechanicsView,
  type PhaseFailedMechanic,
} from "./failed-mechanics-view";

// Conditions another mechanic puts on the player (Void.D from the void
// pools, Debilitated/Infirmity from hits), so the hit itself is the fail.
const STATUS_EFFECT_MECHANICS = new Set(["Void.D", "Debilitated", "Infirmity"]);

interface EventLike {
  mechanicName: string;
  displayName: string;
  timeMs: number;
}

/**
 * Whether `event` counts as a fail. Same definition as the batch page's phase
 * and roster stats (everything except deaths, curated cast markers and
 * (contextual) noise mechanics), minus downstates and status effects: both
 * are the outcome of a hit, not a mechanic of their own, and would otherwise
 * top most lists.
 */
function isFail(bossId: string, event: EventLike, allEvents: EventLike[]): boolean {
  return !(
    event.mechanicName === "Dead" ||
    event.mechanicName === DOWNED_MECHANIC_NAME ||
    STATUS_EFFECT_MECHANICS.has(event.mechanicName) ||
    isVisibleCastMarker(bossId, event.mechanicName) ||
    isNoiseMechanic(bossId, event.mechanicName) ||
    isContextualNoiseMechanic(bossId, event, allEvents)
  );
}

interface EncounterEvents {
  bossId: string;
  /** Every player event of the encounter (contextual noise needs them all). */
  mechanicEvents: (EventLike & { account: string })[];
}

/** Top fails over `encounters`, counting only the events `include` accepts. */
function topFailedMechanics<E extends EncounterEvents>(
  encounters: readonly E[],
  locale: Locale,
  include: (encounter: E, account: string, timeMs: number) => boolean = () => true,
  limit = TOP_FAILED_MECHANICS,
): FailedMechanic[] {
  const byName = new Map<string, FailedMechanic>();
  for (const encounter of encounters) {
    const seen = new Set<string>();
    for (const event of encounter.mechanicEvents) {
      if (!include(encounter, event.account, event.timeMs)) continue;
      if (!isFail(encounter.bossId, event, encounter.mechanicEvents)) continue;
      // Raw names aren't unique across bosses, so they're kept apart per boss.
      const key = `${encounter.bossId}:${event.mechanicName}`;
      const entry = byName.get(key) ?? {
        bossId: encounter.bossId,
        mechanicName: event.mechanicName,
        displayName: translateMechanicName(
          encounter.bossId,
          locale,
          event.mechanicName,
          event.displayName,
        ),
        count: 0,
        attempts: 0,
      };
      entry.count += 1;
      if (!seen.has(key)) entry.attempts += 1;
      seen.add(key);
      byName.set(key, entry);
    }
  }
  return [...byName.values()]
    .sort((a, b) => b.count - a.count || b.attempts - a.attempts)
    .slice(0, limit);
}

interface PhaseSpan {
  name: string;
  startMs: number;
  endMs: number;
  reached: boolean;
}

/**
 * The phases a per-phase view splits a boss's fight into, in fight order:
 * the curated progress phases (dragons and intermissions), or every main
 * phase for bosses without curation.
 */
function fightPhases(bossId: string, phases: readonly PhaseSpan[]): string[] {
  const curated = progressPhases(bossId);
  if (curated) return [...curated];
  return [...new Set(phases.filter((p) => isMainPhase(bossId, p.name)).map((p) => p.name))];
}

/**
 * The fight phase `timeMs` falls into — the narrowest one, as the worker
 * does (lib persist-encounter's resolvePhaseIndex), but among the fight
 * phases only: events are stored under breakbar sub-phases too.
 */
function phaseAt(phases: readonly PhaseSpan[], names: readonly string[], timeMs: number) {
  let best: PhaseSpan | undefined;
  for (const phase of phases) {
    if (!names.includes(phase.name)) continue;
    if (timeMs < phase.startMs || timeMs > phase.endMs) continue;
    if (!best || phase.endMs - phase.startMs < best.endMs - best.startMs) best = phase;
  }
  return best?.name;
}

/** The most failed mechanics per fight phase, counted over the attempts that reached it. */
function topFailedMechanicByPhase(
  encounters: readonly (EncounterEvents & { phases: PhaseSpan[] })[],
  locale: Locale,
): PhaseFailedMechanic[] {
  const result: PhaseFailedMechanic[] = [];
  for (const bossId of new Set(encounters.map((e) => e.bossId))) {
    const ofBoss = encounters.filter((e) => e.bossId === bossId);
    const names = fightPhases(bossId, ofBoss.flatMap((e) => e.phases));
    names.forEach((phase, index) => {
      const reached = ofBoss.filter((e) => e.phases.some((p) => p.name === phase && p.reached));
      if (reached.length === 0) return;
      const top = topFailedMechanics(
        reached,
        locale,
        (e, _account, timeMs) => phaseAt(e.phases, names, timeMs) === phase,
        TOP_FAILED_MECHANICS_PER_PHASE,
      );
      result.push({
        bossId,
        phase,
        color: phaseColor(bossId, index, phase),
        reached: reached.length,
        top,
      });
    });
  }
  return result;
}

interface EventRow {
  encounterResultId: string;
  mechanicName: string;
  displayName: string;
  timeMs: number;
  account: string;
}

async function loadEncounterEvents(projectId: string, account?: string) {
  const encounters = await prisma.encounterResult.findMany({
    where: {
      logFile: { batch: { projectId } },
      ...(account ? { playerResults: { some: { account } } } : {}),
    },
    select: {
      id: true,
      bossId: true,
      logFile: { select: { batchId: true } },
      playerResults: { select: { account: true } },
      phaseResults: { select: { name: true, startMs: true, endMs: true, reached: true } },
    },
  });

  // The events are tens of thousands of rows: as raw SQL in one flat query,
  // since Prisma's nested select (one huge IN list per relation level, then
  // stitching the result together) took about five times as long.
  // Player events only, minus what no view reads (noise such as "Orb Push"
  // and the bulk-captured casts are most rows).
  const unused = unusedMechanicNames([...new Set(encounters.map((e) => e.bossId))]);
  const rows = await prisma.$queryRaw<EventRow[]>`
    SELECT ph."encounterResultId", m."mechanicName", m."displayName", m."timeMs", pr.account
    FROM mechanic_events m
    JOIN player_results pr ON pr.id = m."playerResultId"
    JOIN phase_results ph ON ph.id = m."phaseResultId"
    JOIN encounter_results er ON er.id = ph."encounterResultId"
    JOIN log_files lf ON lf.id = er."logFileId"
    JOIN upload_batches b ON b.id = lf."batchId"
    WHERE b."projectId" = ${projectId}
      AND m."mechanicName" <> ALL(${unused}::text[])
      AND m."mechanicName" NOT LIKE ${`%${GENERIC_CAST_MARKER_NAME_PART}%`}
      ${account ? Prisma.sql`AND pr.account = ${account}` : Prisma.empty}`;

  const eventsByEncounter = new Map<string, EventRow[]>();
  for (const row of rows) {
    const events = eventsByEncounter.get(row.encounterResultId) ?? [];
    events.push(row);
    eventsByEncounter.set(row.encounterResultId, events);
  }

  return encounters.map((e) => ({
    bossId: e.bossId,
    batchId: e.logFile.batchId,
    accounts: e.playerResults.map((p) => p.account),
    phases: e.phaseResults,
    mechanicEvents: (eventsByEncounter.get(e.id) ?? []).map((m) => ({
      mechanicName: m.mechanicName,
      displayName: m.displayName,
      timeMs: m.timeMs,
      account: m.account,
    })),
  }));
}

/**
 * The most frequent fails over a project's attempts — of one player when
 * `account` is given (only the attempts they took part in), otherwise of the
 * whole squad.
 */
export async function loadTopFailedMechanics(
  projectId: string,
  locale: Locale,
  account?: string,
): Promise<FailedMechanicsView> {
  const encounters = await loadEncounterEvents(projectId, account);
  return { mechanics: topFailedMechanics(encounters, locale), attempts: encounters.length };
}

/**
 * The squad's top fails, overall (`all`), per fight phase (`byPhase`, only
 * the few most failed mechanics) and per assigned role
 * (lib/player-roles.ts — a batch override wins over the project's role). A
 * role's view counts only the fails of the players holding it in each
 * attempt, over the attempts in which somebody held it.
 */
export async function loadProjectFailedMechanics(
  projectId: string,
  locale: Locale,
): Promise<{
  all: FailedMechanicsView;
  byRole: Record<string, FailedMechanicsView>;
  byPhase: PhaseFailedMechanic[];
}> {
  const [encounters, projectRoles, batchRoles] = await Promise.all([
    loadEncounterEvents(projectId),
    loadProjectRoles(projectId),
    prisma.batchPlayerRole.findMany({
      where: { batch: { projectId } },
      select: { batchId: true, account: true, role: true },
    }),
  ]);
  const overrides = new Map(batchRoles.map((r) => [`${r.batchId}|${r.account}`, r.role]));
  const roleOf = (batchId: string, account: string) =>
    overrides.get(`${batchId}|${account}`) ?? projectRoles.get(account) ?? null;

  const byRole: Record<string, FailedMechanicsView> = {};
  const roles = new Set(encounters.flatMap((e) => e.accounts.map((a) => roleOf(e.batchId, a))));
  for (const role of roles) {
    if (role === null) continue;
    const held = encounters.filter((e) => e.accounts.some((a) => roleOf(e.batchId, a) === role));
    byRole[role] = {
      mechanics: topFailedMechanics(
        held,
        locale,
        (e, account) => roleOf(e.batchId, account) === role,
      ),
      attempts: held.length,
    };
  }
  return {
    all: { mechanics: topFailedMechanics(encounters, locale), attempts: encounters.length },
    byRole,
    byPhase: topFailedMechanicByPhase(encounters, locale),
  };
}
