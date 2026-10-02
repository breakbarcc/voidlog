import { ProjectRole, prisma } from "@voidlog/db";
import { createStorageClient, deleteObjects } from "@voidlog/shared";
import { NextResponse } from "next/server";
import { checkProjectRole } from "@/lib/projects";
import { requireSession } from "@/lib/session";

/**
 * Deletes a Project and everything under it (ProjectMember, UploadBatch,
 * LogFile, EncounterResult, PhaseResult, PlayerResult, MechanicEvent all
 * cascade away via FK ON DELETE CASCADE). Raw .evtc files in object
 * storage don't cascade — those are deleted explicitly first, across
 * every batch in the project, before the DB rows referencing their keys
 * are gone.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const session = await requireSession();
  const access = await checkProjectRole(projectId, session.user.id, ProjectRole.ADMIN);
  if (!access.ok) return access.response;

  const logFiles = await prisma.logFile.findMany({
    where: { batch: { projectId } },
    select: { storageKeyRaw: true, storageKeyJson: true },
  });
  const storageKeys = logFiles.flatMap((f) =>
    [f.storageKeyRaw, f.storageKeyJson].filter((key): key is string => Boolean(key)),
  );
  if (storageKeys.length > 0) {
    await deleteObjects(createStorageClient(), storageKeys);
  }

  await prisma.project.delete({ where: { id: projectId } });

  return NextResponse.json({ deleted: true });
}
