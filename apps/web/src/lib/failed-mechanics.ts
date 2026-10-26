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

export const TOP_FAILED_MECHANICS = 5;

// Conditions another mechanic puts on the player (Void.D from the void
// pools, Debilitated/Infirmity from hits), so the hit itself is the fail.
const STATUS_EFFECT_MECHANICS = new Set(["Void.D", "Debilitated", "Infirmity"]);

export interface FailedMechanic {
  bossId: string;
  mechanicName: string;
  displayName: string;
  count: number;
  /** Attempts with at least one fail of this mechanic. */
  attempts: number;
}

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

function topFailedMechanics(
  encounters: readonly { bossId: string; mechanicEvents: EventLike[] }[],
  locale: Locale,
): FailedMechanic[] {
  const byName = new Map<string, FailedMechanic>();
  for (const encounter of encounters) {
    const seen = new Set<string>();
    for (const event of encounter.mechanicEvents) {
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

/**
 * The most frequent fails over a project's attempts — of one player when
 * `account` is given (only the attempts they took part in), otherwise of the
 * whole squad. `attempts` is the number of attempts counted.
 */
export async function loadTopFailedMechanics(
  projectId: string,
  locale: Locale,
  account?: string,
): Promise<{ mechanics: FailedMechanic[]; attempts: number }> {
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
            select: { mechanicName: true, displayName: true, timeMs: true },
          },
        },
      },
    },
  });
  const mechanics = topFailedMechanics(
    encounters.map((e) => ({
      bossId: e.bossId,
      mechanicEvents: e.phaseResults.flatMap((p) => p.mechanicEvents),
    })),
    locale,
  );
  return { mechanics, attempts: encounters.length };
}
