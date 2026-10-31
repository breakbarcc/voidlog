import { prisma } from "@voidlog/db";
import { getBossCuration } from "./bosses/registry";
import type { BossCuration } from "./bosses/types";
import { loadBatchRoleOverrides, loadProjectRoles } from "./player-roles";

/**
 * Whether the roles assigned in the rosters (lib/player-roles.ts) add up to
 * the boss's squad (`BossCuration.squadComposition`, e.g. Harvest Temple's
 * 2 HealKite, 2 BoonDPS, 2 Portal, 1 Venticator, DPS for the rest), checked
 * per attempt with the players who took part in it — a batch can have
 * substitutes, so its roster as a whole may hold more of a role.
 */

export type SquadComposition = NonNullable<BossCuration["squadComposition"]>;

/** One way an attempt's roles miss the squad: a role held too often or too rarely. */
export interface RoleDeviation {
  /** The role; null for players without any role. */
  role: string | null;
  actual: number;
  /** 0 for players without a role. */
  expected: number;
}

/** A batch's attempts whose roles don't add up, and how (distinct deviations). */
export interface BatchRoleIssues {
  /** The squad the roles were checked against (of the batch's first mismatched attempt). */
  composition: SquadComposition;
  attempts: number;
  mismatched: number;
  /** Each distinct set of deviations once, most frequent first. */
  deviations: RoleDeviation[][];
}

/**
 * How the roles of one attempt's players miss `bossId`'s squad; empty when
 * they add up, or the boss has no composition curated. The fill role (DPS)
 * is whatever is left, so only the counted roles and missing roles are
 * checked — a count off there shows up as the fill role's anyway.
 */
export function roleDeviations(bossId: string, roles: readonly (string | null)[]): RoleDeviation[] {
  const composition = getBossCuration(bossId)?.squadComposition;
  if (!composition) return [];
  const deviations: RoleDeviation[] = [];
  for (const [role, expected] of Object.entries(composition.counts)) {
    const actual = roles.filter((r) => r === role).length;
    if (actual !== expected) deviations.push({ role, actual, expected });
  }
  const unassigned = roles.filter((r) => r === null).length;
  if (unassigned > 0) deviations.push({ role: null, actual: unassigned, expected: 0 });
  return deviations;
}

/** Role mismatches of every batch of a project that has any. */
export async function loadBatchRoleIssues(
  projectId: string,
): Promise<Map<string, BatchRoleIssues>> {
  const [encounters, projectRoles, overrides] = await Promise.all([
    prisma.encounterResult.findMany({
      where: { logFile: { batch: { projectId } } },
      select: {
        bossId: true,
        logFile: { select: { batchId: true } },
        playerResults: { select: { account: true } },
      },
    }),
    loadProjectRoles(projectId),
    loadBatchRoleOverrides(projectId),
  ]);

  interface BatchEntry {
    attempts: number;
    composition?: SquadComposition;
    deviations: Map<string, RoleDeviation[]>;
  }
  const byBatch = new Map<string, BatchEntry>();
  const counts = new Map<string, number>();
  for (const encounter of encounters) {
    const batchId = encounter.logFile.batchId;
    const entry: BatchEntry = byBatch.get(batchId) ?? { attempts: 0, deviations: new Map() };
    entry.attempts += 1;
    byBatch.set(batchId, entry);

    const roles = encounter.playerResults.map(
      (p) => overrides.get(`${batchId}|${p.account}`) ?? projectRoles.get(p.account) ?? null,
    );
    const deviations = roleDeviations(encounter.bossId, roles);
    if (deviations.length === 0) continue;
    entry.composition ??= getBossCuration(encounter.bossId)?.squadComposition;
    const key = `${batchId}|${JSON.stringify(deviations)}`;
    entry.deviations.set(key, deviations);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const issues = new Map<string, BatchRoleIssues>();
  for (const [batchId, entry] of byBatch) {
    if (entry.deviations.size === 0 || !entry.composition) continue;
    const keys = [...entry.deviations.keys()].sort((a, b) => counts.get(b)! - counts.get(a)!);
    issues.set(batchId, {
      composition: entry.composition,
      attempts: entry.attempts,
      mismatched: keys.reduce((sum, key) => sum + counts.get(key)!, 0),
      deviations: keys.map((key) => entry.deviations.get(key)!),
    });
  }
  return issues;
}
