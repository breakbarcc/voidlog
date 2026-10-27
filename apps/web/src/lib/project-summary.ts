import { prisma } from "@voidlog/db";
import { getBossCuration } from "./bosses/registry";
import { chompMechanicNames, countChomps, hasChompCasts } from "./chomp-stats";
import { greenMechanicNames, squadGreens } from "./green-stats";
import { progressPhases } from "./main-phases";
import { STEALTH_CAST_MECHANIC } from "./player-attempts";
import { REVEAL_MECHANIC, squadReveals } from "./stealth-stats";

/** Totals over every attempt of a project, for the statistics page's overview card. */
export interface ProjectSummary {
  attempts: number;
  durationMs: number;
  greens: {
    /** Greens casts the squad failed (one failing player is enough). */
    failed: number;
    played: number;
    /** Attempts in which at least one Greens cast happened. */
    attempts: number;
  };
  chomps: {
    slam: number;
    jaws: number;
    /** Attempts that reached Primordus's attacks. */
    attempts: number;
    /** Of those, the ones with at least one chomp. */
    attemptsChomped: number;
  };
  reveals: {
    reveals: number;
    /** Mass Invisibility casts, i.e. stealth windows. */
    windows: number;
    /** Windows in which anybody got revealed. */
    revealed: number;
  };
  /** How often each curated boss of the fight was defeated, in fight order; null when none is curated. */
  kills: { bossId: string; name: string; phase: string; count: number }[] | null;
}

/**
 * Whether the boss of `phase` was defeated in an attempt: the attempt was a
 * kill, or it got to a progress phase after `phase` (so the fight moved on).
 */
function defeated(order: readonly string[], phase: string, reached: Set<string>, success: boolean) {
  if (success) return true;
  const index = order.indexOf(phase);
  return index >= 0 && order.slice(index + 1).some((name) => reached.has(name));
}

export async function loadProjectSummary(projectId: string): Promise<ProjectSummary> {
  const encounters = await prisma.encounterResult.findMany({
    where: { logFile: { batch: { projectId } } },
    select: {
      bossId: true,
      success: true,
      durationMs: true,
      phaseResults: {
        select: {
          name: true,
          reached: true,
          // Only what the overview counts.
          mechanicEvents: {
            where: {
              mechanicName: {
                in: [
                  ...greenMechanicNames(),
                  ...chompMechanicNames(),
                  STEALTH_CAST_MECHANIC,
                  REVEAL_MECHANIC,
                ],
              },
            },
            select: { mechanicName: true, timeMs: true },
          },
        },
      },
    },
  });

  const summary: ProjectSummary = {
    attempts: encounters.length,
    durationMs: 0,
    greens: { failed: 0, played: 0, attempts: 0 },
    chomps: { slam: 0, jaws: 0, attempts: 0, attemptsChomped: 0 },
    reveals: { reveals: 0, windows: 0, revealed: 0 },
    kills: null,
  };
  const kills = new Map<string, { bossId: string; name: string; phase: string; count: number }>();

  for (const encounter of encounters) {
    const events = encounter.phaseResults.flatMap((p) => p.mechanicEvents);
    summary.durationMs += encounter.durationMs;

    const greens = squadGreens(encounter.bossId, events);
    summary.greens.failed += greens.failed;
    summary.greens.played += greens.played;
    if (greens.played > 0) summary.greens.attempts += 1;

    if (hasChompCasts(encounter.bossId, events)) {
      const chomps = countChomps(encounter.bossId, events);
      summary.chomps.slam += chomps.slam;
      summary.chomps.jaws += chomps.jaws;
      summary.chomps.attempts += 1;
      if (chomps.slam + chomps.jaws > 0) summary.chomps.attemptsChomped += 1;
    }

    const reveals = squadReveals(events);
    summary.reveals.reveals += reveals.reveals;
    summary.reveals.windows += reveals.windows;
    summary.reveals.revealed += reveals.revealed;

    const bosses = getBossCuration(encounter.bossId)?.defeatableBosses;
    const order = progressPhases(encounter.bossId);
    if (!bosses || !order) continue;
    const reached = new Set(encounter.phaseResults.filter((p) => p.reached).map((p) => p.name));
    for (const boss of bosses) {
      const key = `${encounter.bossId}|${boss.name}`;
      const entry = kills.get(key) ?? { bossId: encounter.bossId, ...boss, count: 0 };
      if (defeated(order, boss.phase, reached, encounter.success)) entry.count += 1;
      kills.set(key, entry);
    }
  }
  if (kills.size > 0) summary.kills = [...kills.values()];
  return summary;
}
