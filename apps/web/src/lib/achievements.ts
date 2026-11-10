import { prisma } from "@voidlog/db";
import { getBossCuration, listBossCurations } from "./bosses/registry";
import type { StackAchievement } from "./bosses/types";

/**
 * Achievements decided by buff stacks on boss-side targets
 * (`BossCuration.stackAchievements`, e.g. Harvest Temple's "Voidwalker":
 * no Void Heart may reach 3 stacks of Void Empowerment), evaluated from the
 * worker's per-target summary events (target-buff-stacks.ts).
 */

/** The `context` the worker stores on each per-target summary event. */
interface StackContext {
  ordinal: number;
  maxStacks: number;
  stackTimesMs: number[];
}

function isStackContext(value: unknown): value is StackContext {
  const v = value as Partial<StackContext> | null;
  return (
    typeof v?.ordinal === "number" &&
    typeof v.maxStacks === "number" &&
    Array.isArray(v.stackTimesMs)
  );
}

export interface AchievementOutcome {
  name: string;
  /** A kill that kept it — earns the achievement for everybody in it. */
  earned: boolean;
  /** The first target to reach the failing stack count, and when; null if none did. */
  failedBy: { ordinal: number; timeMs: number; stacks: number } | null;
}

/**
 * How one attempt went for each of its boss's stack achievements. An
 * achievement whose events are missing (logs processed before they were
 * captured) is left out — unknown, not failed.
 */
export function achievementOutcomes(
  bossId: string,
  success: boolean,
  events: readonly { mechanicName: string; context: unknown }[],
): AchievementOutcome[] {
  const outcomes: AchievementOutcome[] = [];
  for (const achievement of getBossCuration(bossId)?.stackAchievements ?? []) {
    const targets = events
      .filter((e) => e.mechanicName === achievement.mechanicName)
      .map((e) => e.context)
      .filter(isStackContext);
    if (targets.length === 0) continue;
    const failedBy = firstFailure(achievement, targets);
    outcomes.push({ name: achievement.name, earned: success && failedBy === null, failedBy });
  }
  return outcomes;
}

function firstFailure(
  achievement: StackAchievement,
  targets: readonly StackContext[],
): AchievementOutcome["failedBy"] {
  let first: AchievementOutcome["failedBy"] = null;
  for (const target of targets) {
    const timeMs = target.stackTimesMs[achievement.failsAtStacks - 1];
    if (timeMs === undefined || (first && first.timeMs <= timeMs)) continue;
    first = { ordinal: target.ordinal, timeMs, stacks: achievement.failsAtStacks };
  }
  return first;
}

/** Raw names of every summary event a stack achievement reads, for queries. */
export function achievementMechanicNames(): string[] {
  return listBossCurations().flatMap((c) => c.stackAchievements?.map((a) => a.mechanicName) ?? []);
}

/**
 * Per account, the stack achievements they earned in this project's logs,
 * each with the first kill that earned it.
 */
export async function loadAchievementUnlocks(
  projectId: string,
): Promise<Map<string, Map<string, Date>>> {
  const names = achievementMechanicNames();
  if (names.length === 0) return new Map();
  const kills = await prisma.encounterResult.findMany({
    where: {
      success: true,
      logFile: { batch: { projectId } },
      phaseResults: { some: { mechanicEvents: { some: { mechanicName: { in: names } } } } },
    },
    select: {
      bossId: true,
      recordedAt: true,
      createdAt: true,
      playerResults: { select: { account: true } },
      phaseResults: {
        select: {
          mechanicEvents: {
            where: { mechanicName: { in: names } },
            select: { mechanicName: true, context: true },
          },
        },
      },
    },
  });

  const unlocks = new Map<string, Map<string, Date>>();
  for (const kill of kills) {
    const events = kill.phaseResults.flatMap((p) => p.mechanicEvents);
    const at = kill.recordedAt ?? kill.createdAt;
    for (const outcome of achievementOutcomes(kill.bossId, true, events)) {
      if (!outcome.earned) continue;
      for (const { account } of kill.playerResults) {
        const own = unlocks.get(account) ?? new Map<string, Date>();
        const earlier = own.get(outcome.name);
        if (!earlier || at < earlier) own.set(outcome.name, at);
        unlocks.set(account, own);
      }
    }
  }
  return unlocks;
}
