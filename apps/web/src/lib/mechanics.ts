import { getBossCuration } from "./bosses/registry";

// Matches the generic bulk-captured cast markers from cast-markers.ts on
// the worker ("<Group>.Cast.<skillId>") — boss-agnostic, so it stays here
// rather than per-boss: none of them are individually curated/visible
// unless a boss's `visibleCastMarkers` says otherwise.
const GENERIC_CAST_MARKER_PATTERN = /^[A-Za-z]+\.Cast\.-?\d+$/;

export function isNoiseMechanic(bossId: string, mechanicName: string): boolean {
  const curation = getBossCuration(bossId);
  if (curation?.visibleCastMarkers.has(mechanicName)) return false;
  if (GENERIC_CAST_MARKER_PATTERN.test(mechanicName)) return true;
  return curation?.noiseMechanicNames.has(mechanicName) ?? false;
}

/** Curated cast markers get their own timeline tick — excluded from fail-count aggregation/expand-panel lists (same reasoning as "Dead"). */
export function isVisibleCastMarker(bossId: string, mechanicName: string): boolean {
  return getBossCuration(bossId)?.visibleCastMarkers.has(mechanicName) ?? false;
}

/**
 * Whether `event` is noise *given the other mechanic events around it* —
 * see `BossCuration.isContextualNoise`. Always false for bosses without
 * that hook (or without any events implicated), same fail-open default as
 * `isNoiseMechanic`. Call alongside `isNoiseMechanic`, not instead of it.
 */
export function isContextualNoiseMechanic(
  bossId: string,
  event: { mechanicName: string; timeMs: number },
  allEvents: { mechanicName: string; timeMs: number }[],
): boolean {
  return getBossCuration(bossId)?.isContextualNoise?.(event, allEvents) ?? false;
}
