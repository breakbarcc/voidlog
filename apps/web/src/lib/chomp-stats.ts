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

export interface TimedChompEvent extends ChompEvent {
  timeMs: number;
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
    names.add(boss.chomps.slamCast);
    names.add(boss.chomps.jawsCast);
  }
  return [...names];
}

/** Whether the boss cast a chomp attack in this encounter. */
export function hasChompCasts(bossId: string, events: readonly ChompEvent[]): boolean {
  const config = chompsConfig(bossId);
  if (!config) return false;
  return events.some(
    (e) => e.mechanicName === config.slamCast || e.mechanicName === config.jawsCast,
  );
}

/**
 * The squad's chomp attacks in one encounter, counted per cast like the
 * shockwaves and Greens: `played` casts, of which `hit` hit at least one
 * player. Jaws casts only count when `withJaws`. Pass all of the
 * encounter's events.
 */
export function squadChomps(
  bossId: string,
  events: readonly TimedChompEvent[],
  withJaws: boolean,
): { played: number; hit: number } {
  const config = chompsConfig(bossId);
  if (!config) return { played: 0, hit: 0 };
  const attacks = [{ cast: config.slamCast, hit: config.slamHit }];
  if (withJaws) attacks.push({ cast: config.jawsCast, hit: config.jawsHit });
  let played = 0;
  let hit = 0;
  for (const attack of attacks) {
    const casts = events
      .filter((e) => e.mechanicName === attack.cast)
      .map((e) => e.timeMs)
      .sort((a, b) => a - b);
    const hitCasts = new Set<number>();
    for (const e of events) {
      if (e.mechanicName !== attack.hit) continue;
      const cast = casts.findLast((t) => t <= e.timeMs);
      if (cast !== undefined) hitCasts.add(cast);
    }
    played += casts.length;
    hit += hitCasts.size;
  }
  return { played, hit };
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
