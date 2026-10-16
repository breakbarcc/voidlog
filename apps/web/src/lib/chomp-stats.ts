import { getBossCuration, listBossCurations } from "./bosses/registry";
import type { ChompsConfig } from "./bosses/types";

/**
 * "Primordus Chomps": players killed by Primordus's Lava Slam, plus — kept
 * separate so views can switch it on and off — the Jaws of Destruction, which
 * only sometimes kills. Both hits are counted per player and attempt.
 *
 * An attempt only counts as one where the mechanic was in play (`reached`)
 * when the boss cast the Slam or the Jaws at least once; attempts that ended
 * before Primordus must not dilute averages.
 */

export interface ChompEvent {
  mechanicName: string;
}

export interface ChompCount {
  slam: number;
  jaws: number;
}

export function chompsConfig(bossId: string): ChompsConfig | undefined {
  return getBossCuration(bossId)?.chomps;
}

/** Every mechanic name the chomp statistics read, across all curated bosses. */
export function chompMechanicNames(): string[] {
  const names = new Set<string>();
  for (const boss of listBossCurations()) {
    if (!boss.chomps) continue;
    names.add(boss.chomps.slamHit);
    names.add(boss.chomps.jawsHit);
    for (const cast of boss.chomps.castMechanics) names.add(cast);
  }
  return [...names];
}

/** Whether the boss cast a chomp attack in this encounter. */
export function hasChompCasts(bossId: string, events: readonly ChompEvent[]): boolean {
  const config = chompsConfig(bossId);
  if (!config) return false;
  return events.some((e) => config.castMechanics.includes(e.mechanicName));
}

/**
 * Chomp hits in `events`. Pass one player's events for the player's numbers,
 * or all of an encounter's for the squad's total.
 */
export function countChomps(bossId: string, events: readonly ChompEvent[]): ChompCount {
  const config = chompsConfig(bossId);
  if (!config) return { slam: 0, jaws: 0 };
  return {
    slam: events.filter((e) => e.mechanicName === config.slamHit).length,
    jaws: events.filter((e) => e.mechanicName === config.jawsHit).length,
  };
}

/** Slam kills, plus the Jaws ones when `withJaws`. */
export function chompTotal(count: ChompCount, withJaws: boolean): number {
  return count.slam + (withJaws ? count.jaws : 0);
}
