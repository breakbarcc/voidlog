import { prisma } from "@voidlog/db";

/** Phase runs shorter than this are ignored: a wipe right after the phase started says nothing about damage output. */
export const MIN_PHASE_RUN_MS = 10_000;

/** What one raid night did in one phase, summed over all its attempts. */
export interface PhaseDamageTotals {
  /** Attempts that got into the phase for at least `MIN_PHASE_RUN_MS`. */
  runs: number;
  /** Combined duration of those runs. */
  secs: number;
  /** Damage of all players to the phase's own targets. */
  bossDamage: number;
  /** Damage of all players to everything, adds included. */
  totalDamage: number;
}

/**
 * Damage totals per raid night (batch id) and phase name for the given
 * phases. Runs of encounters parsed before damage was stored have no rows and
 * are skipped, so a night without any data simply has no entries.
 */
export async function loadPhaseDamageByBatch(
  projectId: string,
  bossId: string,
  phaseNames: readonly string[],
): Promise<Map<string, Record<string, PhaseDamageTotals>>> {
  const runs = await prisma.phaseResult.findMany({
    where: {
      name: { in: [...phaseNames] },
      reached: true,
      encounterResult: { bossId, logFile: { batch: { projectId } } },
    },
    select: {
      name: true,
      startMs: true,
      endMs: true,
      encounterResult: { select: { logFile: { select: { batchId: true } } } },
      playerDamage: { select: { bossDamage: true, totalDamage: true } },
    },
  });

  const byBatch = new Map<string, Record<string, PhaseDamageTotals>>();
  for (const run of runs) {
    const durationMs = run.endMs - run.startMs;
    if (durationMs < MIN_PHASE_RUN_MS || run.playerDamage.length === 0) continue;

    const batchId = run.encounterResult.logFile.batchId;
    const phases = byBatch.get(batchId) ?? {};
    const totals = phases[run.name] ?? { runs: 0, secs: 0, bossDamage: 0, totalDamage: 0 };
    totals.runs += 1;
    totals.secs += durationMs / 1000;
    for (const player of run.playerDamage) {
      totals.bossDamage += player.bossDamage;
      totals.totalDamage += player.totalDamage;
    }
    phases[run.name] = totals;
    byBatch.set(batchId, phases);
  }
  return byBatch;
}
