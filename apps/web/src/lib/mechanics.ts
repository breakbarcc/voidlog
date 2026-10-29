import { getBossCuration } from "./bosses/registry";
import type { BossCuration } from "./bosses/types";
import { GREEN_LIFECYCLE_MECHANICS } from "./green-player-stats";
import { PLAYER_LIFECYCLE_MECHANICS } from "./shockwave-stats";

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

/**
 * Mechanic names of an encounter that no view reads, so a database query can
 * leave them out instead of loading and then discarding them (a single
 * noise mechanic such as "Orb Push" can be half of all stored events). That
 * is every name that is noise for *all* of `bossIds` — a name that is real
 * for even one of the bosses must still be loaded — except the ones other
 * logic reads: a boss's `noiseNamesStillRead` and the player lifecycle
 * events (respawns). Bulk-captured generic casts are covered separately by
 * `GENERIC_CAST_MARKER_NAME_PART`.
 */
export function unusedMechanicNames(bossIds: readonly string[]): string[] {
  const curations = bossIds.map((id) => getBossCuration(id));
  if (curations.length === 0 || curations.some((c) => c === undefined)) return [];
  const keep = new Set<string>([...PLAYER_LIFECYCLE_MECHANICS, ...GREEN_LIFECYCLE_MECHANICS]);
  const sets = curations.map((c) => c!);
  for (const c of sets) for (const name of c.noiseNamesStillRead ?? []) keep.add(name);
  const [first, ...rest] = sets;
  return [...first!.noiseMechanicNames].filter(
    (name) =>
      !keep.has(name) &&
      !first!.visibleCastMarkers.has(name) &&
      rest.every((c) => c.noiseMechanicNames.has(name) && !c.visibleCastMarkers.has(name)),
  );
}

/** Generic bulk casts are named "<Group>.Cast.<skillId>" — see `isNoiseMechanic`; curated ones end in ".Cast". */
export const GENERIC_CAST_MARKER_NAME_PART = ".Cast.";

/** EI's generic downstate mechanic — what `BossCuration.downCauses` hangs off. */
export const DOWNED_MECHANIC_NAME = "Downed";

/**
 * The unavoidable mechanics to name in the tooltip of a downstate, and how
 * far before it they count — see `BossCuration.downCauses`. Undefined for
 * bosses without any.
 */
export function downCauseConfig(
  bossId: string,
): NonNullable<BossCuration["downCauses"]> | undefined {
  return getBossCuration(bossId)?.downCauses;
}
