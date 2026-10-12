import { prisma } from "@voidlog/db";
import type { ProgressNight } from "@/app/(app)/projects/[projectId]/phase-progress-trend";
import type { Locale } from "@/i18n/locale";
import { batchTitle } from "@/lib/batch-title";
import type { DpsNight } from "@/lib/dps-model";
import { damagePhases, impliedReachedPhases, isMainPhase, progressPhases } from "@/lib/main-phases";
import { loadPhaseDamageByBatch } from "@/lib/phase-damage";
import { shockwaveMechanicNames, shockwavePercent, squadShockwaves } from "@/lib/shockwave-stats";

type MechanicEncounter = {
  phaseResults: { mechanicEvents: { mechanicName: string }[] }[];
};

function hasMechanic(encounter: MechanicEncounter, mechanicName: string): boolean {
  return encounter.phaseResults.some((phase) =>
    phase.mechanicEvents.some((event) => event.mechanicName === mechanicName),
  );
}

// "F.Green" is HTCM's raw EI mechanic code for a failed Green stack.
const OVERVIEW_MECHANIC_NAMES = ["F.Green", ...shockwaveMechanicNames()];

/**
 * Everything the project's history and statistics pages draw from, derived
 * from one query over the project's batches. `withDamage` additionally loads
 * the per-phase damage nights (an extra query — only the statistics page
 * needs them).
 */
export async function loadProjectOverview(projectId: string, locale: Locale, withDamage: boolean) {
  const rawBatches = await prisma.uploadBatch.findMany({
    where: { projectId },
    select: {
      id: true,
      label: true,
      createdAt: true,
      logFiles: {
        select: {
          encounterResult: {
            select: {
              bossId: true,
              success: true,
              recordedAt: true,
              phaseResults: {
                select: {
                  name: true,
                  order: true,
                  reached: true,
                  // Only what the overview computes from: the green stat and the
                  // shockwave statistics. A project holds hundreds of thousands
                  // of events, most of them irrelevant here.
                  mechanicEvents: {
                    where: { mechanicName: { in: OVERVIEW_MECHANIC_NAMES } },
                    select: { mechanicName: true, timeMs: true, playerResultId: true },
                  },
                },
              },
              playerResults: { select: { id: true, dps: true } },
            },
          },
        },
      },
    },
  });

  const batches = rawBatches
    .map((batch) => {
      const encounters = batch.logFiles
        .map((f) => f.encounterResult)
        .filter((e): e is NonNullable<typeof e> => e !== null);

      const kills = encounters.filter((e) => e.success).length;

      // "F.Green" is HTCM's raw EI mechanic code for a failed Green stack
      // (see harvest-temple.ts) — hardcoded like the same stat on the batch
      // detail page, pending a boss-pluggable stat system.
      const greenFailedCount = encounters.filter((e) => hasMechanic(e, "F.Green")).length;
      const greenFailRate =
        encounters.length > 0 ? Math.round((greenFailedCount / encounters.length) * 100) : null;

      // "ShckWv.H" is Mordremoth's raw EI code for a Schockwelle hit — same
      // hardcoded-stat treatment as the Green-fail count above.
      // Share of the squad's shockwaves that failed (hit at least one player),
      // over all attempts — see lib/shockwave-stats.ts.
      let shockwavesPlayed = 0;
      let shockwavesHit = 0;
      for (const encounter of encounters) {
        const squad = squadShockwaves(
          encounter.bossId,
          encounter.phaseResults.flatMap((phase) =>
            phase.mechanicEvents.map((event) => ({
              mechanicName: event.mechanicName,
              timeMs: event.timeMs,
              playerKey: event.playerResultId,
            })),
          ),
          encounter.playerResults.map((player) => player.id),
        );
        shockwavesPlayed += squad.played;
        shockwavesHit += squad.hit;
      }
      const shockwaveHitRate = shockwavePercent({ played: shockwavesPlayed, hit: shockwavesHit });
      let furthestPhase: { name: string; order: number; bossId: string } | null = null;
      for (const encounter of encounters) {
        for (const phase of encounter.phaseResults) {
          if (
            phase.reached &&
            isMainPhase(encounter.bossId, phase.name) &&
            (!furthestPhase || phase.order > furthestPhase.order)
          ) {
            furthestPhase = { ...phase, bossId: encounter.bossId };
          }
        }
      }

      // Prefer the earliest in-game recording time across the batch's logs
      // (EI's timeStartStd) over upload time, so the trend/list reflect
      // when the raid actually happened, not upload order. Falls back to
      // `createdAt` for logs parsed before that field existed.
      const recordedTimestamps = encounters
        .map((e) => e.recordedAt)
        .filter((d): d is Date => d !== null);
      const occurredAt =
        recordedTimestamps.length > 0
          ? new Date(Math.min(...recordedTimestamps.map((d) => d.getTime())))
          : batch.createdAt;

      // Attempts per boss that reached each phase, for the phase progress chart.
      const reachByBoss = new Map<string, { attempts: number; reached: Map<string, number> }>();
      for (const e of encounters) {
        const entry = reachByBoss.get(e.bossId) ?? { attempts: 0, reached: new Map() };
        entry.attempts += 1;
        const names = impliedReachedPhases(
          e.bossId,
          e.phaseResults.filter((p) => p.reached).map((p) => p.name),
        );
        for (const name of names) {
          entry.reached.set(name, (entry.reached.get(name) ?? 0) + 1);
        }
        reachByBoss.set(e.bossId, entry);
      }

      return {
        id: batch.id,
        reachByBoss,
        label: batchTitle(batch.label, occurredAt, locale),
        createdAt: batch.createdAt,
        occurredAt,
        attempts: encounters.length,
        kills,
        greenFailedCount,
        greenFailRate,
        shockwaveHitRate,
        furthestPhase,
      };
    })
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

  const trendPoints = batches
    .slice(0, 10)
    .reverse()
    .filter((b) => b.attempts > 0);

  // The chart is about one encounter: the boss most attempts were made on.
  // Bosses without a curated phase list have nothing to lay out on the x axis.
  const attemptsByBoss = new Map<string, number>();
  for (const batch of batches) {
    for (const [bossId, { attempts }] of batch.reachByBoss) {
      attemptsByBoss.set(bossId, (attemptsByBoss.get(bossId) ?? 0) + attempts);
    }
  }
  const progressBossId = [...attemptsByBoss].sort((a, b) => b[1] - a[1])[0]?.[0];
  const progressPhaseNames = progressBossId ? progressPhases(progressBossId) : undefined;
  const progressNights: ProgressNight[] = progressBossId
    ? batches
        .filter((b) => b.reachByBoss.has(progressBossId))
        .reverse()
        .map((b) => {
          const entry = b.reachByBoss.get(progressBossId);
          return {
            id: b.id,
            occurredAt: b.occurredAt,
            attempts: entry?.attempts ?? 0,
            reached: Object.fromEntries(entry?.reached ?? []),
          };
        })
    : [];

  const dpsPhaseNames = progressBossId ? damagePhases(progressBossId) : undefined;
  const damageByBatch =
    withDamage && progressBossId && dpsPhaseNames
      ? await loadPhaseDamageByBatch(projectId, progressBossId, dpsPhaseNames)
      : new Map();
  const dpsNights: DpsNight[] = progressNights.map((night) => ({
    id: night.id,
    occurredAt: night.occurredAt,
    phases: damageByBatch.get(night.id) ?? {},
  }));

  return {
    batches,
    trendPoints,
    progressBossId,
    progressPhaseNames,
    progressNights,
    dpsPhaseNames,
    dpsNights,
  };
}
