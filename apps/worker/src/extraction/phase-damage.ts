import type { EiPhase, EiPlayer } from "./ei-json-shape";

export interface PhaseDamage {
  /** Damage dealt to the phase's own targets (EI's `phases[].targets`), e.g. the dragon. */
  bossDamage: number;
  /** Damage dealt to everything, adds included. */
  totalDamage: number;
}

/**
 * Damage `player` dealt during `phase`, which sits at `phaseIndex` of EI's
 * original `phases[]` — `dpsAll` and `dpsTargets` are indexed by that
 * position, not by start time. Null when EI carries no damage numbers for the
 * phase, so no row is stored rather than a misleading zero.
 */
export function computePhaseDamage(
  player: EiPlayer,
  phase: EiPhase,
  phaseIndex: number,
): PhaseDamage | null {
  const total = player.dpsAll?.[phaseIndex]?.damage;
  if (typeof total !== "number") return null;

  let boss = 0;
  for (const targetIndex of phase.targets ?? []) {
    boss += player.dpsTargets?.[targetIndex]?.[phaseIndex]?.damage ?? 0;
  }
  return { bossDamage: Math.round(boss), totalDamage: Math.round(total) };
}
