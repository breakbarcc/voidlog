import { type Prisma, prisma } from "@voidlog/db";
import { loadAchievementUnlocks } from "@/lib/achievements";
import { chompMechanicNames, countChomps, hasChompCasts } from "@/lib/chomp-stats";
import {
  addPlayerGreens,
  EMPTY_PLAYER_GREENS,
  GREEN_LIFECYCLE_MECHANICS,
  greenWaveMechanicNames,
  playerGreens,
  type PlayerGreenCount,
} from "@/lib/green-player-stats";
import {
  assignableRoles,
  loadBatchRoleOverrides,
  loadBossIds,
  loadProjectRoles,
} from "@/lib/player-roles";
import {
  countShockwaves,
  shockwaveCastMechanicNames,
  shockwaveCastTimes,
  shockwaveMechanicNames,
} from "@/lib/shockwave-stats";
import { RosterTable } from "./roster-table";

/** A boss-side event (no player) as the shockwave, chomp and Greens stats read it. */
interface BossEvent {
  mechanicName: string;
  timeMs: number;
  context: Prisma.JsonValue;
}

/** The roster table's column count, for its skeleton (roster-table.tsx). */
export const ROSTER_COLUMNS = 13;

/** The title the roster has a column for (lib/achievements.ts). */
const TITLE_ACHIEVEMENT = "Voidwalker";

interface RosterEntry {
  account: string;
  characterNames: Set<string>;
  encounters: number;
  totalDps: number;
  kills: number;
  totalDowns: number;
  lastActive: Date;
  // Shockwaves the player was alive for / that hit them (lib/shockwave-stats.ts).
  shockwavesPlayed: number;
  shockwavesHit: number;
  debilitatedHits: number;
  revealCount: number;
  // Attempts that reached Primordus's chomp attacks / in which the player got
  // chomped (Slam or Jaws) at least once (lib/chomp-stats.ts).
  chompAttempts: number;
  chompedAttempts: number;
  // Greens of the player's role they weren't in (lib/green-player-stats.ts).
  greens: PlayerGreenCount;
}

/**
 * The roster table with its data — loaded on its own, so the page can show
 * its heading at once and stream the table in behind a skeleton (page.tsx).
 */
export async function RosterSection({
  projectId,
  canEdit,
}: Readonly<{ projectId: string; canEdit: boolean }>) {
  // Roles are assigned per project in this table (lib/player-roles.ts).
  const [playerResults, phases, projectRoles, roleOverrides, bossIds, unlocks] = await Promise.all([
    prisma.playerResult.findMany({
      where: { encounterResult: { logFile: { batch: { projectId } } } },
      select: {
        account: true,
        characterName: true,
        dps: true,
        downs: true,
        encounterResultId: true,
        encounterResult: {
          select: {
            logFile: { select: { batchId: true } },
            success: true,
            createdAt: true,
            bossId: true,
          },
        },
        // Only the events the roster counts: Geschwächt, Revealed and what the
        // shockwave, chomp and Greens statistics read. The rest is most of the table.
        mechanicEvents: {
          where: {
            mechanicName: {
              in: [
                "Debilitated",
                "Revealed",
                ...shockwaveMechanicNames(),
                ...chompMechanicNames(),
                ...GREEN_LIFECYCLE_MECHANICS,
              ],
            },
          },
          select: { mechanicName: true, timeMs: true },
        },
      },
    }),
    // Boss-side events only (no player) — carries the shockwave and chomp
    // casts and the Greens waves (with who stood in which circle). Loaded once
    // per project here instead of nested under every player result, which
    // repeated each encounter's events once per squad member. Reached via the
    // project's phases so the events are looked up by phaseResultId (indexed)
    // rather than by filtering the whole event table.
    prisma.phaseResult.findMany({
      where: { encounterResult: { logFile: { batch: { projectId } } } },
      select: {
        encounterResultId: true,
        mechanicEvents: {
          where: {
            playerResultId: null,
            mechanicName: {
              in: [
                ...shockwaveCastMechanicNames(),
                ...chompMechanicNames(),
                ...greenWaveMechanicNames(),
              ],
            },
          },
          select: { mechanicName: true, timeMs: true, context: true },
        },
      },
    }),
    loadProjectRoles(projectId),
    loadBatchRoleOverrides(projectId),
    loadBossIds({ projectId }),
    loadAchievementUnlocks(projectId),
  ]);

  const bossEventsByEncounter = new Map<string, BossEvent[]>();
  for (const phase of phases) {
    const events = bossEventsByEncounter.get(phase.encounterResultId);
    if (events) events.push(...phase.mechanicEvents);
    else bossEventsByEncounter.set(phase.encounterResultId, [...phase.mechanicEvents]);
  }
  // What only depends on the encounter is worked out once, not per player.
  const encounterStats = new Map<
    string,
    { bossEvents: BossEvent[]; castTimes: number[]; hasChomps: boolean }
  >();
  function statsOf(encounterResultId: string, bossId: string) {
    let stats = encounterStats.get(encounterResultId);
    if (!stats) {
      const bossEvents = bossEventsByEncounter.get(encounterResultId) ?? [];
      stats = {
        bossEvents,
        castTimes: shockwaveCastTimes(bossId, bossEvents),
        hasChomps: hasChompCasts(bossId, bossEvents),
      };
      encounterStats.set(encounterResultId, stats);
    }
    return stats;
  }

  // Grouped by account, not character name — character names change,
  // the account handle doesn't (ADR-009).
  const byAccount = new Map<string, RosterEntry>();
  for (const p of playerResults) {
    const entry = byAccount.get(p.account) ?? {
      account: p.account,
      characterNames: new Set<string>(),
      encounters: 0,
      totalDps: 0,
      kills: 0,
      totalDowns: 0,
      lastActive: p.encounterResult.createdAt,
      shockwavesPlayed: 0,
      shockwavesHit: 0,
      debilitatedHits: 0,
      revealCount: 0,
      chompAttempts: 0,
      chompedAttempts: 0,
      greens: { ...EMPTY_PLAYER_GREENS },
    };
    entry.characterNames.add(p.characterName);
    entry.encounters += 1;
    entry.totalDps += p.dps;
    entry.totalDowns += p.downs;
    if (p.encounterResult.success) entry.kills += 1;
    if (p.encounterResult.createdAt > entry.lastActive)
      entry.lastActive = p.encounterResult.createdAt;
    // Counted per shockwave (not per attempt), so a short attempt only weighs
    // in with the shockwaves it actually contained — see lib/shockwave-stats.ts.
    const { bossEvents, castTimes, hasChomps } = statsOf(
      p.encounterResultId,
      p.encounterResult.bossId,
    );
    const shockwaves = countShockwaves(p.encounterResult.bossId, castTimes, p.mechanicEvents);
    entry.shockwavesPlayed += shockwaves.played;
    entry.shockwavesHit += shockwaves.hit;
    // "Debilitated" is HTCM's raw EI debuff name for the Geschwächt stack
    // (see harvest-temple.ts) — same hardcoded-stat treatment.
    entry.debilitatedHits += p.mechanicEvents.filter(
      (m) => m.mechanicName === "Debilitated",
    ).length;
    // "Revealed" is only persisted for isolated early reveals during the
    // Mass-Invisibility stealth window (group "attack now" calls are
    // filtered out entirely — see stealth-phases.ts on the worker), so
    // every occurrence here is already a genuine early-reveal mistake.
    entry.revealCount += p.mechanicEvents.filter((m) => m.mechanicName === "Revealed").length;
    // Only attempts that reached Primordus's attacks count, so early wipes
    // don't dilute the share (same rule as the chomp charts). Slam and Jaws
    // together, matching the player page's Chomps total.
    if (hasChomps) {
      const chomps = countChomps(p.encounterResult.bossId, p.mechanicEvents);
      entry.chompAttempts += 1;
      if (chomps.slam + chomps.jaws > 0) entry.chompedAttempts += 1;
    }
    // Each attempt counts with the role the player held in its batch.
    const role =
      roleOverrides.get(`${p.encounterResult.logFile.batchId}|${p.account}`) ??
      projectRoles.get(p.account) ??
      null;
    addPlayerGreens(
      entry.greens,
      playerGreens(p.encounterResult.bossId, bossEvents, p.mechanicEvents, p.characterName, role),
    );
    byAccount.set(p.account, entry);
  }

  const roster = [...byAccount.values()].map((entry) => {
    const role = projectRoles.get(entry.account) ?? null;
    return {
      account: entry.account,
      characterNames: [...entry.characterNames].join(", "),
      role,
      encounters: entry.encounters,
      kills: entry.kills,
      avgDps: Math.round(entry.totalDps / entry.encounters),
      avgDowns: (entry.totalDowns / entry.encounters).toFixed(1),
      lastActive: entry.lastActive,
      shockwavesPlayed: entry.shockwavesPlayed,
      shockwavesHit: entry.shockwavesHit,
      debilitatedHits: entry.debilitatedHits,
      debilitatedHitsPerEncounter: (entry.debilitatedHits / entry.encounters).toFixed(2),
      revealCount: entry.revealCount,
      revealCountPerEncounter: (entry.revealCount / entry.encounters).toFixed(2),
      chompAttempts: entry.chompAttempts,
      chompedAttempts: entry.chompedAttempts,
      greensExpected: entry.greens.expected,
      greensMissed: entry.greens.missed,
      greensUnavailable: entry.greens.unavailable,
      titleUnlockedAt: unlocks.get(entry.account)?.get(TITLE_ACHIEVEMENT) ?? null,
    };
  });

  return (
    <RosterTable
      projectId={projectId}
      roster={roster}
      roles={assignableRoles(bossIds)}
      canEdit={canEdit}
    />
  );
}
