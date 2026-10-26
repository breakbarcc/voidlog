import { chompMechanicNames, countChomps, hasChompCasts, type ChompCount } from "./chomp-stats";
import { encounterShockwaves, shockwaveMechanicNames } from "./shockwave-stats";

/**
 * One player's numbers for one attempt — the building block of the player
 * detail pages. `null` values mean the player did not take part in the
 * attempt (the charts show a gap, not a zero).
 */
export interface PlayerAttemptStat {
  /** 1-based position of the attempt in the batch, same numbering as the batch page. */
  n: number;
  recordedAt: Date;
  success: boolean;
  dps: number | null;
  /** "Revealed" events: isolated early reveals during the stealth window. */
  revealCount: number | null;
  /**
   * Stealth windows of the attempt (one per Mass Invisibility cast, whoever
   * cast it) — a player can be revealed at most once per window.
   */
  stealthWindows: number | null;
  /** "Debilitated" (Geschwächt) stacks the player received. */
  debilitatedCount: number | null;
  shockwavesPlayed: number | null;
  shockwavesHit: number | null;
  /**
   * Primordus Chomps (Slam / Jaws kills). null when the player was absent or
   * the attempt never got to the attacks.
   */
  chomps: ChompCount | null;
}

/**
 * Mass Invisibility cast that opens a stealth window (worker
 * boss-configs/stealth-phases.ts). Recorded on the casting player, so queries
 * must load it for every player, not just the one the page is about.
 */
export const STEALTH_CAST_MECHANIC = "Invis.Cast";

/** Mechanic names the player statistics read, for narrowing the database query. */
export const PLAYER_STAT_MECHANICS: readonly string[] = [
  ...new Set([
    ...shockwaveMechanicNames(),
    ...chompMechanicNames(),
    "Revealed",
    "Debilitated",
    STEALTH_CAST_MECHANIC,
  ]),
];

interface EventLike {
  mechanicName: string;
  timeMs: number;
  playerResult: { account: string } | null;
}

interface EncounterLike {
  bossId: string;
  success: boolean;
  recordedAt: Date | null;
  createdAt: Date;
  playerResults: { account: string; dps: number }[];
  phaseResults: { mechanicEvents: EventLike[] }[];
}

/**
 * Per-attempt stats of `account` over the given encounters, which must already
 * be in attempt order. Shockwaves are counted per wave the player was alive
 * for (lib/shockwave-stats.ts).
 */
export function playerAttemptStats(
  account: string,
  encounters: readonly EncounterLike[],
): PlayerAttemptStat[] {
  return encounters.map((encounter, index) => {
    const base = {
      n: index + 1,
      recordedAt: encounter.recordedAt ?? encounter.createdAt,
      success: encounter.success,
    };
    const player = encounter.playerResults.find((p) => p.account === account);
    if (!player) {
      return {
        ...base,
        dps: null,
        revealCount: null,
        stealthWindows: null,
        debilitatedCount: null,
        shockwavesPlayed: null,
        shockwavesHit: null,
        chomps: null,
      };
    }
    const events = encounter.phaseResults.flatMap((phase) => phase.mechanicEvents);
    const shockwaves = encounterShockwaves(
      encounter.bossId,
      events.map((e) => ({
        mechanicName: e.mechanicName,
        timeMs: e.timeMs,
        playerKey: e.playerResult?.account ?? null,
      })),
      [account],
    ).get(account);
    return {
      ...base,
      dps: player.dps,
      revealCount: events.filter(
        (e) => e.mechanicName === "Revealed" && e.playerResult?.account === account,
      ).length,
      stealthWindows: events.filter((e) => e.mechanicName === STEALTH_CAST_MECHANIC).length,
      debilitatedCount: events.filter(
        (e) => e.mechanicName === "Debilitated" && e.playerResult?.account === account,
      ).length,
      shockwavesPlayed: shockwaves?.played ?? 0,
      shockwavesHit: shockwaves?.hit ?? 0,
      chomps: hasChompCasts(encounter.bossId, events)
        ? countChomps(
            encounter.bossId,
            events.filter((e) => e.playerResult?.account === account),
          )
        : null,
    };
  });
}
