import { prisma } from "@voidlog/db";
import { createStorageClient, deleteObjects } from "@voidlog/shared";
import { NextResponse } from "next/server";
import { requireProjectMembership } from "@/lib/projects";
import { requireSession } from "@/lib/session";

/** Renames a batch's label. */
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
  await requireProjectMembership(batch.projectId, session.user.id);

  const body = await request.json().catch(() => null);
  const label = typeof body?.label === "string" ? body.label.trim() : "";
  if (!label) {
    return NextResponse.json({ error: "Label must not be empty" }, { status: 400 });
  }

  const updated = await prisma.uploadBatch.update({
    where: { id: batchId },
    data: { label },
  });

  return NextResponse.json({ label: updated.label });
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
  await requireProjectMembership(batch.projectId, session.user.id);

  const logFiles = await prisma.logFile.findMany({
    where: { batchId },
    select: { storageKeyRaw: true, storageKeyJson: true },
  });
  const storageKeys = logFiles.flatMap((f) =>
    [f.storageKeyRaw, f.storageKeyJson].filter((key): key is string => Boolean(key)),
  );
  if (storageKeys.length > 0) {
    await deleteObjects(createStorageClient(), storageKeys);
  }

  await prisma.uploadBatch.delete({ where: { id: batchId } });

  return NextResponse.json({ deleted: true });
}
