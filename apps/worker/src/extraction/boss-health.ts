import type { EiPhase, EiTarget } from "./ei-json-shape";

/**
 * Health the encounter's last enemy had left when the attempt ended, in
 * percent (0 = dead, 100 = untouched), or null if EI has no health for it.
 *
 * "The last enemy" is boss-agnostic: among the targets of the full-fight
 * phase (EI's first phase — the real bosses, as opposed to adds, hazards
 * and breakbar sub-targets, which only appear in sub-phases), the one that
 * became active last *and* actually had health. Targets that never had
 * health — a final boss that was never reached has `totalHealth: -1` — are
 * skipped, so a wipe on the dragon before it still reports that dragon's
 * health rather than a spawned-but-unengaged successor's.
 */
export function computeFinalBossHealthPercent(
  phases: EiPhase[],
  targets: EiTarget[],
): number | null {
  const fullFightIndices = phases[0]?.targets ?? targets.map((_, i) => i);

  let last: { target: EiTarget; firstAware: number } | undefined;
  for (const index of fullFightIndices) {
    const target = targets[index];
    if (
      !target ||
      typeof target.healthPercentBurned !== "number" ||
      typeof target.totalHealth !== "number" ||
      target.totalHealth <= 0 ||
      typeof target.finalHealth !== "number" ||
      target.finalHealth < 0
    ) {
      continue;
    }
    const firstAware = target.firstAware ?? 0;
    if (!last || firstAware >= last.firstAware) {
      last = { target, firstAware };
    }
  }
  if (!last) return null;

  const remaining = 100 - (last.target.healthPercentBurned ?? 0);
  return Math.round(Math.min(100, Math.max(0, remaining)) * 100) / 100;
}
