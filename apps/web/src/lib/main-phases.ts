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

/**
 * Every main phase of `bossId` in fight order, reached or not — see
 * `BossCuration.progressPhases`. Undefined for bosses without curation.
 */
export function progressPhases(bossId: string): readonly string[] | undefined {
  return getBossCuration(bossId)?.progressPhases;
}

/**
 * The phases of `bossId` whose damage is comparable between nights, in fight
 * order — see `BossCuration.damagePhases`. Undefined for bosses without it.
 */
export function damagePhases(bossId: string): readonly string[] | undefined {
  return getBossCuration(bossId)?.damagePhases;
}

/**
 * The curated progress phases an attempt reached, including the ones before
 * its deepest reached phase. A log can miss the start of the fight (EI
 * "Late Start") and then has no row for the earliest phases, although the
 * group necessarily went through them. Without curation: the names as given.
 */
export function impliedReachedPhases(bossId: string, reached: Iterable<string>): Set<string> {
  const names = new Set(reached);
  const order = progressPhases(bossId);
  if (!order) return names;
  const deepest = order.findLastIndex((name) => names.has(name));
  for (const name of order.slice(0, deepest + 1)) names.add(name);
  return names;
}
