import { getBossCuration, listBossCurations } from "./bosses/registry";
import type { GreensConfig } from "./bosses/types";

/**
 * Greens statistics counted per *Greens cast*, like the shockwave statistics
 * (see shockwave-stats.ts): every cast of the boss counts once, and it counts
 * as failed as soon as at least one player failed it — a failed Green hits the
 * whole squad, so several failing players are still one failed cast. Attempts
 * with several casts therefore weigh in proportion to them.
 */

export interface GreenEvent {
  mechanicName: string;
  timeMs: number;
}

export interface GreenCount {
  /** Greens casts that happened. */
  played: number;
  /** Of those, the ones that at least one player failed. */
  failed: number;
}

export function greensConfig(bossId: string): GreensConfig | undefined {
  return getBossCuration(bossId)?.greens;
}

/** Every mechanic name the Greens statistics read, across all curated bosses. */
export function greenMechanicNames(): string[] {
  const names = new Set<string>();
  for (const boss of listBossCurations()) {
    if (!boss.greens) continue;
    names.add(boss.greens.castMechanic);
    names.add(boss.greens.failMechanic);
  }
  return [...names];
}

/** The squad's Greens in one encounter: `events` are all of its events, others are ignored. */
export function squadGreens(bossId: string, events: readonly GreenEvent[]): GreenCount {
  const config = greensConfig(bossId);
  if (!config) return { played: 0, failed: 0 };
  const casts = events.filter((e) => e.mechanicName === config.castMechanic);
  const fails = events.filter((e) => e.mechanicName === config.failMechanic);
  // The cast marker sits at the first resolution of its wave, the fail events
  // of the same wave follow within the window; the next wave is far away.
  const failed = casts.filter((cast) =>
    fails.some((f) => Math.abs(f.timeMs - cast.timeMs) <= config.windowMs),
  ).length;
  return { played: casts.length, failed };
}

/** Failed share in percent (rounded), null when no Greens were cast. */
export function greenPercent(count: GreenCount): number | null {
  return count.played > 0 ? Math.round((count.failed / count.played) * 100) : null;
}
