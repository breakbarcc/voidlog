import { prisma } from "@voidlog/db";
import { getBossCuration } from "./bosses/registry";

/**
 * The squad roles a player can be assigned in the rosters. Roles are curated
 * per boss (`BossCuration.squadRoles`, e.g. Harvest Temple's "HealKite"), so
 * this is the roles of the bosses fought in the project or batch; empty when
 * none of them has any.
 */
export function assignableRoles(bossIds: readonly string[]): string[] {
  const roles = new Set<string>();
  for (const bossId of bossIds) {
    for (const role of getBossCuration(bossId)?.squadRoles ?? []) roles.add(role);
  }
  return [...roles];
}

/** The distinct bosses fought in a project, or in one of its batches. */
export async function loadBossIds(where: { projectId: string } | { batchId: string }) {
  const rows = await prisma.encounterResult.findMany({
    where: {
      logFile:
        "batchId" in where ? { batchId: where.batchId } : { batch: { projectId: where.projectId } },
    },
    select: { bossId: true },
    distinct: ["bossId"],
  });
  return rows.map((r) => r.bossId);
}

/** Project-wide role per account (the project roster's dropdown). */
export async function loadProjectRoles(projectId: string): Promise<Map<string, string>> {
  const rows = await prisma.projectPlayerRole.findMany({
    where: { projectId },
    select: { account: true, role: true },
  });
  return new Map(rows.map((r) => [r.account, r.role]));
}

export interface BatchRoles {
  /** The project-wide role per account. */
  project: Map<string, string>;
  /** Roles set for this batch only, winning over `project`. */
  overrides: Map<string, string>;
}

export async function loadBatchRoles(projectId: string, batchId: string): Promise<BatchRoles> {
  const [project, overrides] = await Promise.all([
    loadProjectRoles(projectId),
    prisma.batchPlayerRole.findMany({
      where: { batchId },
      select: { account: true, role: true },
    }),
  ]);
  return { project, overrides: new Map(overrides.map((r) => [r.account, r.role])) };
}

/**
 * Every batch override of a project, keyed `${batchId}|${account}` — for
 * views over the whole project, where each attempt's batch decides.
 */
export async function loadBatchRoleOverrides(projectId: string): Promise<Map<string, string>> {
  const rows = await prisma.batchPlayerRole.findMany({
    where: { batch: { projectId } },
    select: { batchId: true, account: true, role: true },
  });
  return new Map(rows.map((r) => [`${r.batchId}|${r.account}`, r.role]));
}

/** The role that counts for `account` in a batch: its override, else the project's. */
export function effectiveRole(roles: BatchRoles, account: string): string | null {
  return roles.overrides.get(account) ?? roles.project.get(account) ?? null;
}

/**
 * Reads `{ account, role }` from a role-assignment request body; `role: null`
 * removes the assignment. Null for a malformed body or a role not in `roles`.
 */
export function parseRoleAssignment(
  body: unknown,
  roles: readonly string[],
): { account: string; role: string | null } | null {
  if (typeof body !== "object" || body === null) return null;
  const { account, role } = body as Record<string, unknown>;
  if (typeof account !== "string" || account.trim() === "") return null;
  if (role === null) return { account, role: null };
  if (typeof role !== "string" || !roles.includes(role)) return null;
  return { account, role };
}
