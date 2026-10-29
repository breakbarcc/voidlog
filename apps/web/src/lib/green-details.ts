import { greensConfig } from "./green-stats";

/**
 * What the worker recorded about one Green circle resolution (the `context`
 * of an S.Green / F.Green row, see worker extraction/green-waves.ts) —
 * absent on logs parsed before it existed (`pnpm backfill:greens`).
 */
/** Players a circle needs to hold — the rule the worker resolved the circles with. */
export const GREEN_MIN_PLAYERS = 2;

export type GreenResult = "ok" | "failed" | "collateral";

export interface GreenDetail {
  /** The Greens phase: the boss, Soo-Won split into "Soo-Won 1"/"Soo-Won 2". */
  phase: string;
  /** 1-based, counted within the phase. */
  wave: number;
  /** Compass label of the circle ("W", "SE"), null when it could not be identified. */
  label: string | null;
  result: GreenResult;
  /** Character names standing in the circle just before it resolved. */
  inside: string[];
  /** False when no position was available, so `inside` says nothing. */
  insideKnown: boolean;
  /** The role this circle belongs to in its phase, from the boss's curation. */
  role: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isResult(value: unknown): value is GreenResult {
  return value === "ok" || value === "failed" || value === "collateral";
}

/** The role a circle has in a Greens phase, null if the boss has none curated. */
export function greenRole(bossId: string, phase: string, label: string | null): string | null {
  if (label === null) return null;
  return greensConfig(bossId)?.roles?.[phase]?.[label] ?? null;
}

/** Reads `context.green` of an S.Green/F.Green row; null for rows without it. */
export function readGreenDetail(bossId: string, context: unknown): GreenDetail | null {
  if (!isRecord(context) || !isRecord(context.green)) return null;
  const g = context.green;
  if (typeof g.phase !== "string" || typeof g.wave !== "number" || !isResult(g.result)) return null;
  const label = typeof g.label === "string" ? g.label : null;
  return {
    phase: g.phase,
    wave: g.wave,
    label,
    result: g.result,
    inside: Array.isArray(g.inside)
      ? g.inside.filter((n): n is string => typeof n === "string")
      : [],
    insideKnown: g.insideKnown === true,
    role: greenRole(bossId, g.phase, label),
  };
}

/** "Soo-Won 2 SE" — the circle as a short name; just the phase when unidentified. */
export function greenCircleName(detail: Pick<GreenDetail, "phase" | "label">): string {
  return detail.label ? `${detail.phase} ${detail.label}` : detail.phase;
}

/** One wave of Greens as recorded on its Green.Spawn marker (`context.greenWave`). */
export interface GreenWaveDetail {
  phase: string;
  wave: number;
  failed: boolean;
  circles: {
    label: string | null;
    result: GreenResult;
    /** Character names standing in the circle just before it resolved. */
    inside: string[];
    /** False when no position was available, so `inside` says nothing. */
    insideKnown: boolean;
  }[];
}

export function readGreenWave(context: unknown): GreenWaveDetail | null {
  if (!isRecord(context) || !isRecord(context.greenWave)) return null;
  const w = context.greenWave;
  if (typeof w.phase !== "string" || typeof w.wave !== "number" || !Array.isArray(w.greens)) {
    return null;
  }
  return {
    phase: w.phase,
    wave: w.wave,
    failed: w.failed === true,
    circles: w.greens.filter(isRecord).flatMap((g) =>
      isResult(g.result)
        ? [
            {
              label: typeof g.label === "string" ? g.label : null,
              result: g.result,
              inside: Array.isArray(g.inside)
                ? g.inside.filter((n): n is string => typeof n === "string")
                : [],
              insideKnown: g.insideKnown === true,
            },
          ]
        : [],
    ),
  };
}

/** Played/failed per circle ("Soo-Won 2" + "SE") across any number of Green.Spawn rows. */
export interface CircleStat {
  phase: string;
  label: string;
  /** Waves this circle took part in. */
  played: number;
  /** Waves in which it was the circle that was short on players. */
  failed: number;
}

export function addCircleStats(into: Map<string, CircleStat>, contexts: Iterable<unknown>): void {
  for (const context of contexts) {
    const wave = readGreenWave(context);
    if (!wave) continue;
    for (const circle of wave.circles) {
      if (circle.label === null) continue;
      const key = `${wave.phase}|${circle.label}`;
      const stat = into.get(key) ?? {
        phase: wave.phase,
        label: circle.label,
        played: 0,
        failed: 0,
      };
      stat.played += 1;
      if (circle.result === "failed") stat.failed += 1;
      into.set(key, stat);
    }
  }
}
