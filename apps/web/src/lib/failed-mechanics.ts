import { prisma } from "@voidlog/db";
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
import { loadProjectRoles } from "./player-roles";
import {
  TOP_FAILED_MECHANICS,
  type FailedMechanic,
  type FailedMechanicsView,
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
  include: (encounter: E, account: string) => boolean = () => true,
): FailedMechanic[] {
  const byName = new Map<string, FailedMechanic>();
  for (const encounter of encounters) {
    const seen = new Set<string>();
    for (const event of encounter.mechanicEvents) {
      if (!include(encounter, event.account)) continue;
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
    .slice(0, TOP_FAILED_MECHANICS);
}

async function loadEncounterEvents(projectId: string, account?: string) {
  const where = {
    logFile: { batch: { projectId } },
    ...(account ? { playerResults: { some: { account } } } : {}),
  };
  const bosses = await prisma.encounterResult.findMany({
    where,
    select: { bossId: true },
    distinct: ["bossId"],
  });
  const encounters = await prisma.encounterResult.findMany({
    where,
    select: {
      bossId: true,
      logFile: { select: { batchId: true } },
      playerResults: { select: { account: true } },
      phaseResults: {
        select: {
          // Player events only, minus what no view reads (noise such as
          // "Orb Push" and the bulk-captured casts are most rows).
          mechanicEvents: {
            where: {
              playerResult: account ? { is: { account } } : { isNot: null },
              mechanicName: { notIn: unusedMechanicNames(bosses.map((b) => b.bossId)) },
              NOT: { mechanicName: { contains: GENERIC_CAST_MARKER_NAME_PART } },
            },
            select: {
              mechanicName: true,
              displayName: true,
              timeMs: true,
              playerResult: { select: { account: true } },
            },
          },
        },
      },
    },
  });
  return encounters.map((e) => ({
    bossId: e.bossId,
    batchId: e.logFile.batchId,
    accounts: e.playerResults.map((p) => p.account),
    mechanicEvents: e.phaseResults.flatMap((p) =>
      p.mechanicEvents.map((m) => ({
        mechanicName: m.mechanicName,
        displayName: m.displayName,
        timeMs: m.timeMs,
        account: m.playerResult?.account ?? "",
      })),
    ),
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
 * The squad's top fails, overall (`all`) and per assigned role
 * (lib/player-roles.ts — a batch override wins over the project's role). A
 * role's view counts only the fails of the players holding it in each
 * attempt, over the attempts in which somebody held it.
 */
export async function loadTopFailedMechanicsByRole(
  projectId: string,
  locale: Locale,
): Promise<{ all: FailedMechanicsView; byRole: Record<string, FailedMechanicsView> }> {
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
  };
}
