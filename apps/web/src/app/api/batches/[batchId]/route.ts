import { ProjectRole, prisma } from "@voidlog/db";
import { createLogParsingQueue, createStorageClient, deleteObjects } from "@voidlog/shared";
import { NextResponse } from "next/server";
import { checkProjectRole } from "@/lib/projects";
import { requireSession } from "@/lib/session";

/** Renames a batch; an empty label switches back to the automatic date name. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  const { batchId } = await params;
  const session = await requireSession();

  const batch = await prisma.uploadBatch.findUnique({ where: { id: batchId } });
  if (!batch) {
    return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  }
  const access = await checkProjectRole(batch.projectId, session.user.id, ProjectRole.CONTRIBUTOR);
  if (!access.ok) return access.response;

  const body = await request.json().catch(() => null);
  const label = typeof body?.label === "string" ? body.label.trim() : "";

  const updated = await prisma.uploadBatch.update({
    where: { id: batchId },
    data: { label },
  });

  return NextResponse.json({ label: updated.label });
}

/**
 * Drops the batch's parse jobs that the worker hasn't picked up yet, so a
 * deleted (or cancelled) batch doesn't keep eating dps.report's rate limit.
 * A job already running finds its log file gone and skips it (worker).
 */
async function removeQueuedJobs(logFileIds: ReadonlySet<string>): Promise<void> {
  if (logFileIds.size === 0) return;
  const queue = createLogParsingQueue();
  // BullMQ 6 reports jobs of a paused queue as "waiting" (no separate "paused" state).
  const jobs = await queue.getJobs(["waiting", "prioritized", "delayed"]);
  await Promise.all(
    jobs
      .filter((job) => logFileIds.has(job.data.logFileId))
      // A job may turn active between listing and removing — the worker copes.
      .map((job) => job.remove().catch(() => undefined)),
  );
}

/**
 * Deletes an UploadBatch and everything under it. DB rows (LogFile,
 * EncounterResult, PhaseResult, PlayerResult, MechanicEvent) cascade away
 * via FK ON DELETE CASCADE, but the raw .evtc files in object storage
 * don't — those are deleted explicitly first, before the DB rows that
 * reference their keys are gone, so a failed storage delete never leaves
 * a LogFile pointing at nothing.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  const { batchId } = await params;
  const session = await requireSession();

  const batch = await prisma.uploadBatch.findUnique({ where: { id: batchId } });
  if (!batch) {
    return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  }
  const access = await checkProjectRole(batch.projectId, session.user.id, ProjectRole.CONTRIBUTOR);
  if (!access.ok) return access.response;

  const logFiles = await prisma.logFile.findMany({
    where: { batchId },
    select: { id: true, storageKeyRaw: true, storageKeyJson: true },
  });
  await removeQueuedJobs(new Set(logFiles.map((f) => f.id)));

  const storageKeys = logFiles.flatMap((f) =>
    [f.storageKeyRaw, f.storageKeyJson].filter((key): key is string => Boolean(key)),
  );
  if (storageKeys.length > 0) {
    await deleteObjects(createStorageClient(), storageKeys);
  }

  await prisma.uploadBatch.delete({ where: { id: batchId } });

  return NextResponse.json({ deleted: true });
}
