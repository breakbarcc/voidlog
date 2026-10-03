import { getBossCuration } from "./bosses/registry";

/**
 * Whether `phaseName` counts as one of `bossId`'s main progression phases
 * — used so aggregate/summary views (furthest-phase badges, batch-wide
 * timeline stats) only surface phases that matter for progression
 * tracking, not Elite Insights' auto-generated breakbar/CM sub-phases
 * (e.g. "Heart 2 Breakbar 1"), which the worker persists unfiltered as
 * PhaseResult rows alongside the real ones.
 *
 * Detailed views (single-log breakdown, per-attempt timeline segments)
 * intentionally keep showing every phase — this filter is only for
 * summaries where sub-phase noise drowns out the boss progression.
 *
 * Bosses without curation (see lib/bosses/registry.ts) are left
 * unfiltered — every phase counts as "main" until curated.
 */
export function isMainPhase(bossId: string, phaseName: string): boolean {
  const curation = getBossCuration(bossId);
  if (!curation) return true;
  return curation.isMainPhase(phaseName);
}

/**
 * Whether the remaining boss health stored for an attempt that ended in
 * `phaseName` should be shown — see `BossCuration.showsBossHealth`. Bosses
 * without curation always show it.
 */
export function showsBossHealth(bossId: string, phaseName: string): boolean {
  return getBossCuration(bossId)?.showsBossHealth?.(phaseName) ?? true;
}
