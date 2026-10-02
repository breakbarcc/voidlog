import { ProjectRole, prisma } from "@voidlog/db";
import { createStorageClient, deleteObjects } from "@voidlog/shared";
import { NextResponse } from "next/server";
import { checkProjectRole } from "@/lib/projects";
import { requireSession } from "@/lib/session";

/**
 * Removes a single LogFile from its batch — used to drop failed uploads
 * that aren't worth retrying (e.g. a corrupt file). Storage objects are
 * deleted first, same ordering as the batch-delete route, so a failed
 * storage delete never leaves a DB row pointing at nothing.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ logFileId: string }> },
) {
  const { logFileId } = await params;
  const session = await requireSession();

  const logFile = await prisma.logFile.findUnique({
    where: { id: logFileId },
    include: { batch: true },
  });
  if (!logFile) {
    return NextResponse.json({ error: "Log file not found" }, { status: 404 });
  }
  const access = await checkProjectRole(
    logFile.batch.projectId,
    session.user.id,
    ProjectRole.CONTRIBUTOR,
  );
  if (!access.ok) return access.response;

  const storageKeys = [logFile.storageKeyRaw, logFile.storageKeyJson].filter((key): key is string =>
    Boolean(key),
  );
  if (storageKeys.length > 0) {
    await deleteObjects(createStorageClient(), storageKeys);
  }

  await prisma.logFile.delete({ where: { id: logFileId } });

  return NextResponse.json({ deleted: true });
}
