import type { EiPhase } from "../extraction/ei-json-shape";

/**
 * Phases EI does not emit on its own but that the curated progression needs.
 *
 * Harvest Temple CM's Soo-Won is split by her health: above 50% is
 * "Soo-Won 1", below is "Soo-Won 2", with "Purification 4" in between. EI
 * only creates the two sub-phases once the fight has gone through that split
 * (they are carved out of the wrapper phase "Soo-Won" around Purification 4).
 * An attempt that wipes before 50% therefore only has the plain "Soo-Won"
 * phase — which is by definition the "Soo-Won 1" part, but would otherwise
 * not count as a progress phase at all and show the previous phase
 * ("Purification 3") as the furthest one.
 */
export interface DerivedPhaseRule {
  /** The phase EI does emit. */
  wrapper: string;
  /** The phase to add, covering the wrapper's whole time range. */
  derived: string;
  /** The rule only applies when none of these exist already. */
  unlessAnyOf: readonly string[];
}

export const DERIVED_PHASES_BY_BOSS: Record<string, readonly DerivedPhaseRule[]> = {
  // Harvest Temple CM (Dragon's End)
  "43488": [{ wrapper: "Soo-Won", derived: "Soo-Won 1", unlessAnyOf: ["Soo-Won 1", "Soo-Won 2"] }],
};

/**
 * `phases` plus the phases `bossId`'s rules derive. `derivedFrom` maps every
 * derived phase to the EI phase it was copied from (same time range and
 * targets), so callers can resolve things that EI indexes by the original
 * phase, e.g. damage.
 */
export function withDerivedPhases(
  bossId: string,
  phases: readonly EiPhase[],
): { phases: EiPhase[]; derivedFrom: Map<EiPhase, EiPhase> } {
  const result = [...phases];
  const derivedFrom = new Map<EiPhase, EiPhase>();
  for (const rule of DERIVED_PHASES_BY_BOSS[bossId] ?? []) {
    if (phases.some((p) => rule.unlessAnyOf.includes(p.name))) continue;
    const wrapper = phases.find((p) => p.name === rule.wrapper);
    if (!wrapper) continue;
    const derived: EiPhase = { ...wrapper, name: rule.derived };
    result.push(derived);
    derivedFrom.set(derived, wrapper);
  }
  return { phases: result, derivedFrom };
}
