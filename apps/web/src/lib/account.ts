import { Prisma, ProjectRole, prisma } from "@voidlog/db";
import { createStorageClient, deleteObjects } from "@voidlog/shared";

/**
 * "Logs linked to an account" are the logs that account uploaded
 * (`LogFile.uploadedById`) — in any project, owned or shared.
 */

function storageKeysOf(logFiles: { storageKeyRaw: string; storageKeyJson: string | null }[]) {
  return logFiles.flatMap((f) =>
    [f.storageKeyRaw, f.storageKeyJson].filter((key): key is string => Boolean(key)),
  );
}

/**
 * Deletes every log the user uploaded, across all projects. Batches left
 * empty by that go too; projects and members stay. Raw files in object
 * storage are removed first (same ordering as the other delete routes), so a
 * failed storage delete never leaves a row pointing at nothing.
 */
export async function deleteLogsUploadedBy(userId: string) {
  const logFiles = await prisma.logFile.findMany({
    where: { uploadedById: userId },
    select: { id: true, batchId: true, storageKeyRaw: true, storageKeyJson: true },
  });
  if (logFiles.length === 0) {
    return { deletedLogs: 0 };
  }

  const keys = storageKeysOf(logFiles);
  if (keys.length > 0) {
    await deleteObjects(createStorageClient(), keys);
  }

  const batchIds = [...new Set(logFiles.map((f) => f.batchId))];
  await prisma.$transaction([
    prisma.logFile.deleteMany({ where: { id: { in: logFiles.map((f) => f.id) } } }),
    prisma.uploadBatch.deleteMany({ where: { id: { in: batchIds }, logFiles: { none: {} } } }),
  ]);
  return { deletedLogs: logFiles.length };
}

export interface AccountDeletionPlan {
  /** Projects that disappear entirely: the user is their only admin. */
  deleted: { id: string; name: string; otherMembers: number }[];
  /** Projects that carry on; ownership passes to the longest-standing other admin. */
  transferred: { id: string; name: string; newOwnerId: string }[];
}

/**
 * What deleting the account would do to each project it administers or owns.
 * Projects the user is only a plain member of just lose that member. Takes a
 * transaction client so the real deletion can plan under row locks.
 */
export async function planAccountDeletion(
  db: Prisma.TransactionClient,
  userId: string,
): Promise<AccountDeletionPlan> {
  const projects = await db.project.findMany({
    where: {
      OR: [{ ownerId: userId }, { members: { some: { userId, role: ProjectRole.ADMIN } } }],
    },
    select: {
      id: true,
      name: true,
      ownerId: true,
      members: { select: { userId: true, role: true, createdAt: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const plan: AccountDeletionPlan = { deleted: [], transferred: [] };
  for (const project of projects) {
    const successor = project.members
      .filter((m) => m.role === ProjectRole.ADMIN && m.userId !== userId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];

    if (!successor) {
      plan.deleted.push({
        id: project.id,
        name: project.name,
        otherMembers: project.members.filter((m) => m.userId !== userId).length,
      });
    } else if (project.ownerId === userId) {
      plan.transferred.push({ id: project.id, name: project.name, newOwnerId: successor.userId });
    }
  }
  return plan;
}

/**
 * Deletes the account. Projects it is the sole admin of are deleted with all
 * their data; projects with another admin continue under that admin. Every
 * other membership, the Auth.js accounts/sessions and the user's `uploadedBy`
 * attribution fall away through FK cascades / SET NULL — logs the user
 * uploaded to surviving projects stay, just without an uploader.
 *
 * Everything runs in one transaction that locks all affected project rows
 * (the same lock the member/invite mutations take), so the plan can't change
 * between deciding which projects to delete and deleting their storage
 * objects. Storage goes first, before the rows that reference its keys.
 */
export async function deleteAccount(userId: string): Promise<AccountDeletionPlan> {
  return prisma.$transaction(
    async (tx) => {
      const projectIds = (
        await tx.project.findMany({
          where: { OR: [{ ownerId: userId }, { members: { some: { userId } } }] },
          select: { id: true },
          orderBy: { id: "asc" },
        })
      ).map((p) => p.id);
      if (projectIds.length > 0) {
        await tx.$queryRaw`SELECT id FROM projects WHERE id IN (${Prisma.join(projectIds)}) ORDER BY id FOR UPDATE`;
      }

      const plan = await planAccountDeletion(tx, userId);
      const doomedIds = plan.deleted.map((p) => p.id);

      if (doomedIds.length > 0) {
        const logFiles = await tx.logFile.findMany({
          where: { batch: { projectId: { in: doomedIds } } },
          select: { storageKeyRaw: true, storageKeyJson: true },
        });
        const keys = storageKeysOf(logFiles);
        if (keys.length > 0) {
          await deleteObjects(createStorageClient(), keys);
        }
      }

      for (const project of plan.transferred) {
        await tx.project.update({
          where: { id: project.id },
          data: { ownerId: project.newOwnerId },
        });
      }
      // Project.ownerId has no ON DELETE CASCADE, so these must go before the user.
      await tx.project.deleteMany({ where: { id: { in: doomedIds } } });
      await tx.user.delete({ where: { id: userId } });
      return plan;
    },
    { timeout: 120_000, maxWait: 10_000 },
  );
}
