import { ProjectRole, prisma } from "@voidlog/db";
import { notFound } from "next/navigation";
import { NextResponse } from "next/server";
import { cache } from "react";

/**
 * Project-scoping (ADR-007): every project-level page/route must confirm
 * the current user is a ProjectMember — with a sufficient role — before
 * returning any data. Roles form a linear hierarchy:
 *
 *   VIEWER       read everything in the project
 *   CONTRIBUTOR  + upload logs, rename/delete batches and logs, retry parsing
 *   ADMIN        + manage the project itself (delete it, later: members/invites)
 */
const ROLE_RANK: Record<ProjectRole, number> = {
  [ProjectRole.VIEWER]: 0,
  [ProjectRole.CONTRIBUTOR]: 1,
  [ProjectRole.ADMIN]: 2,
};

export function hasRole(role: ProjectRole, minRole: ProjectRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minRole];
}

/**
 * Wrapped in React's `cache()` so the project layout and the page it
 * wraps — both of which need this check — share one DB query per
 * request instead of two.
 */
const findMembership = cache((projectId: string, userId: string) =>
  prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    include: { project: true },
  }),
);

/** Pages: any member may pass; everyone else gets a 404. */
export async function requireProjectMembership(projectId: string, userId: string) {
  const membership = await findMembership(projectId, userId);
  if (!membership) {
    notFound();
  }
  return membership;
}

/**
 * Pages: like `requireProjectMembership`, but a member with too low a role
 * also gets a 404 — a page they may not use is treated as nonexistent.
 */
export async function requireProjectRole(projectId: string, userId: string, minRole: ProjectRole) {
  const membership = await requireProjectMembership(projectId, userId);
  if (!hasRole(membership.role, minRole)) {
    notFound();
  }
  return membership;
}

type RoleCheck =
  | { ok: true; membership: NonNullable<Awaited<ReturnType<typeof findMembership>>> }
  | { ok: false; response: NextResponse };

/**
 * Route handlers: 404 for non-members (the project's existence isn't
 * revealed), 403 for members whose role is too low. Usage:
 *
 *   const access = await checkProjectRole(projectId, userId, ProjectRole.CONTRIBUTOR);
 *   if (!access.ok) return access.response;
 */
export async function checkProjectRole(
  projectId: string,
  userId: string,
  minRole: ProjectRole,
): Promise<RoleCheck> {
  const membership = await findMembership(projectId, userId);
  if (!membership) {
    return { ok: false, response: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }
  if (!hasRole(membership.role, minRole)) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true, membership };
}
