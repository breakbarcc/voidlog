import { harvestTemple } from "./harvest-temple";
import type { BossCuration } from "./types";

/**
 * All curated bosses, keyed by bossId. Add a new boss by creating a
 * sibling file (see harvest-temple.ts) that exports a `BossCuration` and
 * registering it here — nothing else in this directory needs to change.
 */
const BOSSES: Record<string, BossCuration> = {
  [harvestTemple.bossId]: harvestTemple,
};

/** Returns undefined for a boss without curation — callers fall back to an unfiltered/generic default. */
export function getBossCuration(bossId: string): BossCuration | undefined {
  return BOSSES[bossId];
}

/** Every curated boss — for callers that need names across all of them (e.g. DB query filters). */
export function listBossCurations(): BossCuration[] {
  return Object.values(BOSSES);
}
