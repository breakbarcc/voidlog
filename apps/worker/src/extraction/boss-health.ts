import type { EiPhase, EiTarget } from "./ei-json-shape";

/**
 * Health the encounter's last enemy had left when the attempt ended, in
 * percent (0 = dead, 100 = untouched), or null if EI has no health for it.
 *
 * "The last enemy" is boss-agnostic: among the targets of the full-fight
 * phase (EI's first phase — essentially the real bosses, though EI also
 * lists the odd add there, e.g. a purification heart) that actually had
 * health, the one that was active the longest. A boss that survived to the
 * end of the fight is "active" until that very moment, whereas an add that
 * died earlier — or a previous dragon — has an earlier `lastAware`. Ordering
 * by *start* time instead would wrongly pick such an add, since it can spawn
 * after the boss was engaged.
 *
 * Targets that never had health — a final boss that was never reached has
 * `totalHealth: -1` — are skipped, so a wipe on the dragon before it still
 * reports that dragon's health rather than a spawned-but-unengaged
 * successor's.
 */
export function computeFinalBossHealthPercent(
  phases: EiPhase[],
  targets: EiTarget[],
): number | null {
  const fullFightIndices = phases[0]?.targets ?? targets.map((_, i) => i);

  let last: { target: EiTarget; lastAware: number } | undefined;
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
    const lastAware = target.lastAware ?? 0;
    if (!last || lastAware >= last.lastAware) {
      last = { target, lastAware };
    }
  }
  if (!last) return null;

  const remaining = 100 - (last.target.healthPercentBurned ?? 0);
  return Math.round(Math.min(100, Math.max(0, remaining)) * 100) / 100;
}
