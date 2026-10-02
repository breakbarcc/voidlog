import { prisma } from "@voidlog/db";
import { createStorageClient, deleteObjects } from "@voidlog/shared";

/**
 * "Logs linked to an account" are the logs inside projects the user owns:
 * LogFile has no uploader column, so ownership of the project is the only
 * link. Logs the user merely uploaded into someone else's project stay with
 * that project's owner.
 */
export async function deleteStorageObjectsOfOwnedProjects(userId: string): Promise<void> {
  const logFiles = await prisma.logFile.findMany({
    where: { batch: { project: { ownerId: userId } } },
    select: { storageKeyRaw: true, storageKeyJson: true },
  });
  const storageKeys = logFiles.flatMap((f) =>
    [f.storageKeyRaw, f.storageKeyJson].filter((key): key is string => Boolean(key)),
  );
  if (storageKeys.length > 0) {
    await deleteObjects(createStorageClient(), storageKeys);
  }
}
