import type { PhaseDamageTotals } from "./phase-damage";

/** From this many runs on a night a phase counts fully; fewer is shown as preliminary. */
export const FULL_RUNS = 5;
/** A night needs this many fully counted phases for a "Gesamt" point. */
const MIN_PHASES_FOR_TOTAL = 2;
/** From this many fully counted phases the "Gesamt" point is not preliminary. */
const FULL_PHASES_FOR_TOTAL = 3;

export type DamageMetric = "bossDamage" | "totalDamage";

export interface DpsNight {
  id: string;
  occurredAt: Date;
  /** Per phase name; empty when the night's logs carry no phase damage. */
  phases: Record<string, PhaseDamageTotals>;
}

export interface DpsPoint {
  runs: number;
  secs: number;
  /** DPS, or null when there is no run to base it on. */
  v: number | null;
  /** At least `FULL_RUNS` runs. */
  full: boolean;
}

export interface TotalPoint extends DpsPoint {
  /** Phases that went into the weighted value. */
  includedPhases: number;
  /** Phases with some, but too few runs to count. */
  lowPhases: { name: string; runs: number }[];
}

export interface PhaseSeries {
  name: string;
  /** Pooled DPS of the phase over all fully counted nights — the phase's own baseline. */
  mean: number | null;
  points: DpsPoint[];
}

export interface DpsSeries {
  phases: PhaseSeries[];
  /** Pooled DPS over all fully counted phase points; scales the weighted index back to a DPS. */
  reference: number;
  total: TotalPoint[];
}

function weightedMean(points: DpsPoint[]): number | null {
  const secs = points.reduce((sum, p) => sum + p.secs, 0);
  if (secs === 0) return null;
  return points.reduce((sum, p) => sum + (p.v ?? 0) * p.secs, 0) / secs;
}

/**
 * DPS per phase and night, plus the "Gesamt" series. A plain total divided by
 * the total time would drop whenever a night gets into weaker phases, even if
 * every single phase improved. So each phase is compared with its own
 * baseline (`mean`), those ratios are averaged weighted by the time spent, and
 * the result is scaled by `reference` to read as a DPS again.
 */
export function buildDpsSeries(
  phaseNames: readonly string[],
  nights: readonly DpsNight[],
  metric: DamageMetric,
): DpsSeries {
  const phases: PhaseSeries[] = phaseNames.map((name) => {
    const points = nights.map((night): DpsPoint => {
      const totals = night.phases[name];
      const runs = totals?.runs ?? 0;
      const secs = totals?.secs ?? 0;
      return {
        runs,
        secs,
        v: totals && runs > 0 && secs > 0 ? totals[metric] / secs : null,
        full: runs >= FULL_RUNS,
      };
    });
    return { name, mean: weightedMean(points.filter((p) => p.full)), points };
  });

  const reference = weightedMean(phases.flatMap((p) => p.points.filter((q) => q.full))) ?? 0;

  const total = nights.map((_, i): TotalPoint => {
    const included = phases.filter((p) => p.points[i]?.full && p.mean);
    const lowPhases = phases
      .filter((p) => (p.points[i]?.runs ?? 0) > 0 && !p.points[i]?.full)
      .map((p) => ({ name: p.name, runs: p.points[i]?.runs ?? 0 }));
    if (included.length < MIN_PHASES_FOR_TOTAL) {
      return { runs: 0, secs: 0, v: null, full: false, includedPhases: included.length, lowPhases };
    }
    const secs = included.reduce((sum, p) => sum + (p.points[i]?.secs ?? 0), 0);
    const index =
      included.reduce(
        (sum, p) => sum + (p.points[i]?.secs ?? 0) * ((p.points[i]?.v ?? 0) / (p.mean ?? 1)),
        0,
      ) / secs;
    return {
      runs: included.reduce((sum, p) => sum + (p.points[i]?.runs ?? 0), 0),
      secs,
      v: index * reference,
      full: included.length >= FULL_PHASES_FOR_TOTAL,
      includedPhases: included.length,
      lowPhases,
    };
  });

  return { phases, reference, total };
}

/** Percentage change from `base` to `value`, rounded; under 1 % counts as no change. */
export function percentChange(value: number, base: number): number {
  const d = (value / base - 1) * 100;
  return Math.abs(d) < 1 ? 0 : Math.round(d);
}

export interface DpsComparison {
  /** Percentage change between the early and the late nights. */
  delta: number;
  /** Night indices averaged for the start / the end. */
  from: number[];
  to: number[];
}

/**
 * Change over time of a series: the mean of its first fully counted nights
 * against the mean of its last ones (up to two each), so one odd night at
 * either end does not decide the result. Null with fewer than two such nights.
 */
export function compareSeries(points: DpsPoint[]): DpsComparison | null {
  const full = points.flatMap((p, i) => (p.full && p.v !== null ? [i] : []));
  if (full.length < 2) return null;
  const k = Math.min(2, Math.floor(full.length / 2));
  const from = full.slice(0, k);
  const to = full.slice(-k);
  const avg = (indices: number[]) =>
    indices.reduce((sum, i) => sum + (points[i]?.v ?? 0), 0) / indices.length;
  return { delta: percentChange(avg(to), avg(from)), from, to };
}
