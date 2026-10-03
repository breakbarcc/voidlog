import { ProjectRole, prisma } from "@voidlog/db";

export type MemberChangeResult =
  { ok: true } | { ok: false; status: 404 | 409; error: "not_found" | "last_admin" };

/**
 * Role changes and removals share two invariants, enforced inside one
 * transaction that locks the project row so concurrent requests (two admins
 * demoting each other, say) are serialized instead of both passing the check:
 *
 *  1. A project always keeps at least one ADMIN.
 *  2. `Project.ownerId` always points at an ADMIN member. When the owner is
 *     demoted or leaves, ownership moves to the longest-standing other admin.
 */
async function mutateMember(
  projectId: string,
  memberId: string,
  change: { type: "remove" } | { type: "role"; role: ProjectRole },
): Promise<MemberChangeResult> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM projects WHERE id = ${projectId} FOR UPDATE`;

    const target = await tx.projectMember.findFirst({
      where: { id: memberId, projectId },
      include: { project: { select: { ownerId: true } } },
    });
    if (!target) {
      return { ok: false, status: 404, error: "not_found" } as const;
    }

    const losesAdmin =
      target.role === ProjectRole.ADMIN &&
      (change.type === "remove" || change.role !== ProjectRole.ADMIN);

    if (losesAdmin) {
      const successor = await tx.projectMember.findFirst({
        where: { projectId, role: ProjectRole.ADMIN, id: { not: memberId } },
        orderBy: { createdAt: "asc" },
      });
      if (!successor) {
        return { ok: false, status: 409, error: "last_admin" } as const;
      }
      if (target.project.ownerId === target.userId) {
        await tx.project.update({ where: { id: projectId }, data: { ownerId: successor.userId } });
      }
    }

    if (change.type === "remove") {
      await tx.projectMember.delete({ where: { id: memberId } });
    } else {
      await tx.projectMember.update({ where: { id: memberId }, data: { role: change.role } });
    }
    return { ok: true } as const;
  });
}

export function changeMemberRole(projectId: string, memberId: string, role: ProjectRole) {
  return mutateMember(projectId, memberId, { type: "role", role });
}

export function removeMember(projectId: string, memberId: string) {
  return mutateMember(projectId, memberId, { type: "remove" });
}
